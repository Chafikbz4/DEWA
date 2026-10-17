import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  chifaSubmissions,
  dataRetentionJobs,
  files,
  ocrResults,
} from '../../database/schema';
import { FilesService } from '../files/files.service';
import { SettingsService } from '../settings/settings.service';

const BATCH = 200;

/** Orders still in progress keep their prescription until they end. */
const ACTIVE_ORDER_STATUSES = [
  'AWAITING_PAYMENT',
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
  'PHARMACIST_VALIDATION_PENDING',
  'PREPARING',
  'READY_FOR_PICKUP',
  'DELIVERY_ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'REFUND_PENDING',
];

/**
 * Scheduled secure deletion (sensitive_data_retention_days /
 * ocr_text_retention_days – placeholders until legal confirmation):
 * - prescription / Chifa images past files.retention_until are deleted from
 *   storage (they are encrypted; deleting the object destroys the data) and
 *   the file row is tombstoned, unless an order on that request is active;
 * - Chifa insurance numbers of expired submissions are erased;
 * - encrypted OCR raw text and extracted JSON past their retention are erased.
 * Every run is recorded in data_retention_jobs.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger('Retention');

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly files: FilesService,
    private readonly settings: SettingsService,
  ) {}

  private async record(resourceType: string, work: () => Promise<number>) {
    const [job] = await this.db
      .insert(dataRetentionJobs)
      .values({ resourceType, status: 'RUNNING' })
      .returning({ id: dataRetentionJobs.id });
    try {
      const n = await work();
      await this.db
        .update(dataRetentionJobs)
        .set({ status: 'SUCCEEDED', recordsDeleted: n })
        .where(eq(dataRetentionJobs.id, job.id));
      return n;
    } catch (err) {
      await this.db
        .update(dataRetentionJobs)
        .set({
          status: 'FAILED',
          errorMessage: (err as Error).message.slice(0, 500),
        })
        .where(eq(dataRetentionJobs.id, job.id));
      this.logger.error(
        `retention ${resourceType} failed: ${(err as Error).message}`,
      );
      return 0;
    }
  }

  /** Prescription / Chifa images whose retention elapsed and that no active order needs. */
  purgeSensitiveFiles(now = new Date()) {
    return this.record('sensitive_files', async () => {
      const due = await this.db
        .select()
        .from(files)
        .where(
          and(
            inArray(files.purpose, ['PRESCRIPTION', 'CHIFA_CARD']),
            isNull(files.deletedAt),
            isNotNull(files.retentionUntil),
            lt(files.retentionUntil, now),
            sql`NOT EXISTS (
              SELECT 1 FROM orders o
              WHERE o.request_id IN (
                SELECT rf.request_id FROM request_files rf WHERE rf.file_id = ${files.id}
                UNION SELECT cs.request_id FROM chifa_submissions cs WHERE cs.card_file_id = ${files.id})
              AND o.status IN (${sql.join(
                ACTIVE_ORDER_STATUSES.map((s) => sql`${s}`),
                sql`, `,
              )}))`,
          ),
        )
        .limit(BATCH);
      for (const f of due) await this.files.purge(f);
      return due.length;
    });
  }

  /** Chifa insurance numbers are erased with the same retention as the card images. */
  async eraseChifaNumbers(now = new Date()) {
    const days = await this.settings.get('sensitive_data_retention_days');
    return this.record('chifa_numbers', async () => {
      const rows = await this.db
        .update(chifaSubmissions)
        .set({ insuranceNumberEncrypted: null, holderName: null })
        .where(
          and(
            isNotNull(chifaSubmissions.insuranceNumberEncrypted),
            lt(
              chifaSubmissions.createdAt,
              new Date(now.getTime() - days * 86_400_000),
            ),
          ),
        )
        .returning({ id: chifaSubmissions.id });
      return rows.length;
    });
  }

  async eraseOcrText(now = new Date()) {
    const days = await this.settings.get('ocr_text_retention_days');
    return this.record('ocr_text', async () => {
      const rows = await this.db
        .update(ocrResults)
        .set({ rawTextEncrypted: null, extractedJson: null })
        .where(
          and(
            lt(
              ocrResults.createdAt,
              new Date(now.getTime() - days * 86_400_000),
            ),
            sql`(${ocrResults.rawTextEncrypted} IS NOT NULL OR ${ocrResults.extractedJson} IS NOT NULL)`,
          ),
        )
        .returning({ id: ocrResults.id });
      return rows.length;
    });
  }

  async runAll(now = new Date()) {
    return {
      sensitive_files: await this.purgeSensitiveFiles(now),
      chifa_numbers: await this.eraseChifaNumbers(now),
      ocr_text: await this.eraseOcrText(now),
    };
  }
}
