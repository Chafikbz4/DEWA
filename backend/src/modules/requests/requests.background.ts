import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { PHARMACY_ROLES } from '../../common/auth/auth-user';
import { CryptoService } from '../../common/crypto/crypto.service';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  chifaSubmissions,
  consentRecords,
  ocrResults,
  pharmacies,
  pharmacyStaff,
  requestFiles,
  requestItems,
  requestRecipients,
  requests,
} from '../../database/schema';
import { FileAccessService } from '../files/file-access.service';
import { FilesService } from '../files/files.service';
import { JobQueueService } from '../jobs/job-queue.service';
import { IOcrProvider, OCR_PROVIDER } from './providers/ocr.provider';
import { OPEN_REQUEST_STATUSES } from './request-lifecycle.service';
import { OCR_JOB, RequestsService } from './requests.service';

/** Recipient statuses that still entitle a pharmacy to read the prescription. */
const READING_RECIPIENT_STATUSES = [
  'SENT',
  'VIEWED',
  'CLARIFICATION_ASKED',
  'OFFERED',
] as const;

@Injectable()
export class RequestsBackground implements OnModuleInit {
  private readonly logger = new Logger('RequestsJobs');
  private readonly jobsEnabled: boolean;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(OCR_PROVIDER) private readonly ocr: IOcrProvider | null,
    private readonly jobs: JobQueueService,
    private readonly files: FilesService,
    private readonly fileAccess: FileAccessService,
    private readonly requests: RequestsService,
    private readonly crypto: CryptoService,
    config: ConfigService,
  ) {
    this.jobsEnabled = config.get<boolean>('JOBS_ENABLED', true);
  }

  onModuleInit() {
    this.jobs.register(
      OCR_JOB,
      (p: { requestFileId: string }) => this.runOcr(p.requestFileId),
      {
        attempts: 3,
        backoffMs: 5_000,
      },
    );
    this.fileAccess.registerRule((user, file) =>
      this.prescriptionRule(user, file),
    );
  }

  /**
   * Prescription / CHIFA files: readable by OWNER or PHARMACIST staff of a
   * VERIFIED recipient pharmacy, only while the patient's share-consent is
   * active. Assistants never see them. Every access is a sensitive access.
   */
  private async prescriptionRule(
    user: Parameters<Parameters<FileAccessService['registerRule']>[0]>[0],
    file: Parameters<Parameters<FileAccessService['registerRule']>[0]>[1],
  ) {
    if (file.purpose !== 'PRESCRIPTION' && file.purpose !== 'CHIFA_CARD')
      return null;
    if (!PHARMACY_ROLES.includes(user.role) || user.status !== 'ACTIVE')
      return null;

    const requestIds =
      file.purpose === 'PRESCRIPTION'
        ? (
            await this.db
              .select({ id: requestFiles.requestId })
              .from(requestFiles)
              .where(eq(requestFiles.fileId, file.id))
          ).map((r) => r.id)
        : (
            await this.db
              .select({ id: chifaSubmissions.requestId })
              .from(chifaSubmissions)
              .where(eq(chifaSubmissions.cardFileId, file.id))
          ).map((r) => r.id);
    if (!requestIds.length) return null;

    const [hit] = await this.db
      .select({ requestId: requests.id })
      .from(requests)
      .innerJoin(
        consentRecords,
        eq(consentRecords.id, requests.consentRecordId),
      )
      .innerJoin(
        requestRecipients,
        eq(requestRecipients.requestId, requests.id),
      )
      .innerJoin(pharmacies, eq(pharmacies.id, requestRecipients.pharmacyId))
      .innerJoin(pharmacyStaff, eq(pharmacyStaff.pharmacyId, pharmacies.id))
      .where(
        and(
          inArray(requests.id, requestIds),
          isNull(consentRecords.revokedAt),
          inArray(requestRecipients.status, [...READING_RECIPIENT_STATUSES]),
          eq(pharmacies.status, 'VERIFIED'),
          eq(pharmacyStaff.userId, user.id),
          eq(pharmacyStaff.isActive, true),
          inArray(pharmacyStaff.staffRole, ['OWNER', 'PHARMACIST']),
        ),
      )
      .limit(1);
    if (!hit) return null;
    return {
      via: 'pharmacy-recipient',
      sensitive: {
        type:
          file.purpose === 'PRESCRIPTION'
            ? ('PRESCRIPTION' as const)
            : ('CHIFA' as const),
        resourceId: hit.requestId,
      },
    };
  }

  /** Advisory OCR: adds suggestions, never confirms them, never changes status. */
  async runOcr(requestFileId: string) {
    if (!this.ocr) return;
    const [row] = await this.db
      .select({ rf: requestFiles, status: requests.status })
      .from(requestFiles)
      .innerJoin(requests, eq(requests.id, requestFiles.requestId))
      .where(eq(requestFiles.id, requestFileId))
      .limit(1);
    if (!row || !OPEN_REQUEST_STATUSES.includes(row.status)) return;
    const file = await this.files.findActive(row.rf.fileId);
    if (!file) return;

    const output = await this.ocr.extract(
      await this.files.readDecrypted(file),
      file.mimeType,
    );
    await this.db.transaction(async (tx) => {
      await tx.insert(ocrResults).values({
        requestFileId,
        provider: output.provider,
        rawTextEncrypted: this.crypto.encrypt(output.rawText),
        extractedJson: { suggestions: output.suggestions },
        status: 'COMPLETED',
      });
      const existing = await tx
        .select({ rawName: requestItems.rawName })
        .from(requestItems)
        .where(eq(requestItems.requestId, row.rf.requestId));
      const known = new Set(existing.map((e) => e.rawName.toLowerCase()));
      const fresh = output.suggestions.filter(
        (s) => !known.has(s.name.toLowerCase()),
      );
      if (fresh.length) {
        await tx.insert(requestItems).values(
          fresh.map((s) => ({
            requestId: row.rf.requestId,
            rawName: s.name.slice(0, 255),
            quantity: Math.max(1, Math.min(100, s.quantity ?? 1)),
            dosageText: s.dosage?.slice(0, 255) ?? null,
            source: 'OCR' as const,
            ocrConfidence: Math.max(0, Math.min(1, s.confidence)),
            confirmedByPharmacist: false,
          })),
        );
      }
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async expireRequestsJob() {
    if (!this.jobsEnabled) return;
    const n = await this.requests.expireDue();
    if (n) this.logger.log(`Expired ${n} request(s)`);
  }
}
