import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  notInArray,
  sql,
  SQL,
} from 'drizzle-orm';
import { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import { DomainEvent } from '../../common/events/domain-events';
import { UnitOfWork } from '../../common/events/unit-of-work';
import { Paginated } from '../../common/http/envelope';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  chifaSubmissions,
  consentRecords,
  dependants,
  INACTIVE_ORDER_STATUSES,
  offers,
  orders,
  pharmacies,
  requestFiles,
  requestItems,
  requestRecipients,
  requests,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { JobQueueService } from '../jobs/job-queue.service';
import { PatientsService } from '../patients/patients.service';
import { SettingsService } from '../settings/settings.service';
import {
  CreateRequestDto,
  MatchingPreviewDto,
  RequestDetailDto,
  RequestItemInputDto,
  RequestsQueryDto,
  RequestSummaryDto,
  UpdateRequestItemDto,
} from './dto/requests.dto';
import { EligibilityService } from './eligibility.service';
import { MatchingService } from './matching.service';
import {
  CNAS_VERIFICATION_PROVIDER,
  ICnasVerificationProvider,
} from './providers/cnas.provider';
import {
  OPEN_REQUEST_STATUSES,
  RequestLifecycleService,
  RequestStatus,
} from './request-lifecycle.service';

export const OCR_JOB = 'requests.ocr';
/** Version label for the per-request "share my prescription" consent. */
export const SHARE_CONSENT_VERSION = 'per-request-v1';

const EDITABLE_ITEM_STATUSES: RequestStatus[] = [
  'REQUEST_SUBMITTED',
  'AWAITING_PHARMACY_RESPONSE',
  'CLARIFICATION_REQUIRED',
];

type RequestRow = typeof requests.$inferSelect;

@Injectable()
export class RequestsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(CNAS_VERIFICATION_PROVIDER)
    private readonly cnas: ICnasVerificationProvider,
    private readonly uow: UnitOfWork,
    private readonly patients: PatientsService,
    private readonly files: FilesService,
    private readonly matching: MatchingService,
    private readonly eligibility: EligibilityService,
    private readonly lifecycle: RequestLifecycleService,
    private readonly settings: SettingsService,
    private readonly jobs: JobQueueService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- matching

  async previewMatching(user: AuthUser, dto: MatchingPreviewDto) {
    const address = await this.patients.getAddress(user.id, dto.address_id);
    const pharmaciesFound = await this.matching.match({
      wilayaId: address.wilaya_id,
      communeId: address.commune_id,
      latitude: address.latitude,
      longitude: address.longitude,
      deliveryWanted: dto.delivery_wanted,
      pharmacyIds: dto.pharmacy_ids,
    });
    return {
      pharmacies: pharmaciesFound,
      max_pharmacies: await this.settings.get('max_pharmacies_per_request'),
      mode: dto.pharmacy_ids?.length ? 'PATIENT_CHOICE' : 'AUTOMATIC',
    };
  }

  // ------------------------------------------------------------------ create

  async create(
    user: AuthUser,
    dto: CreateRequestDto,
    meta: RequestMeta,
  ): Promise<RequestDetailDto> {
    if (dto.consent_to_share !== true)
      throw new AppException('REQUEST_CONSENT_REQUIRED');

    const address = await this.patients.getAddress(user.id, dto.address_id);
    if (dto.dependant_id)
      await this.patients.assertCanRequestFor(user.id, dto.dependant_id);

    const items = dto.items ?? [];
    const fileIds = dto.file_ids ?? [];
    if (dto.request_type === 'PRODUCT') {
      if (!items.length || items.some((i) => !i.medicine_id)) {
        throw new AppException('VALIDATION_FAILED', [
          {
            field: 'items',
            errors: [
              { rule: 'isNotEmpty', message_key: 'validation.isNotEmpty' },
            ],
          },
        ]);
      }
    } else if (!fileIds.length) {
      throw new AppException('VALIDATION_FAILED', [
        {
          field: 'file_ids',
          errors: [
            { rule: 'arrayNotEmpty', message_key: 'validation.arrayNotEmpty' },
          ],
        },
      ]);
    }
    if (new Set(fileIds).size !== fileIds.length) {
      throw new AppException('VALIDATION_FAILED', [
        {
          field: 'file_ids',
          errors: [
            { rule: 'arrayUnique', message_key: 'validation.arrayUnique' },
          ],
        },
      ]);
    }
    if (
      dto.request_type === 'CHIFA' &&
      (!dto.card_file_id || !dto.insurance_number || !dto.holder_name)
    ) {
      throw new AppException('CHIFA_DATA_REQUIRED');
    }

    // Files: owned, PRESCRIPTION purpose, clean, never attached to another request.
    await this.files.assertUsable(user.id, fileIds, ['PRESCRIPTION']);
    if (fileIds.length) {
      const reused = await this.db
        .select({ fileId: requestFiles.fileId })
        .from(requestFiles)
        .where(inArray(requestFiles.fileId, fileIds));
      if (reused.length)
        throw new AppException('FILE_INVALID_FOR_USE', {
          file_ids: reused.map((r) => r.fileId),
        });
    }
    if (dto.card_file_id)
      await this.files.assertUsable(
        user.id,
        [dto.card_file_id],
        ['CHIFA_CARD'],
      );

    // Policy check BEFORE matching: restricted categories are rejected with a specific code.
    await this.eligibility.assertRequestAllowed({
      requestType: dto.request_type,
      medicineIds: items
        .map((i) => i.medicine_id)
        .filter((x): x is string => !!x),
      deliveryWanted: dto.delivery_wanted,
    });

    const recipients = await this.matching.match({
      wilayaId: address.wilaya_id,
      communeId: address.commune_id,
      latitude: address.latitude,
      longitude: address.longitude,
      deliveryWanted: dto.delivery_wanted,
      pharmacyIds: dto.pharmacy_ids,
    });
    if (!recipients.length)
      throw new AppException('REQUEST_NO_PHARMACY_MATCHED');

    // CHIFA: official verification only through the provider (default: NOT_AVAILABLE).
    let chifa: {
      status: 'NOT_VERIFIED' | 'VERIFIED' | 'FAILED';
      via: string | null;
    } | null = null;
    if (dto.request_type === 'CHIFA') {
      const check = await this.cnas.verify({
        insuranceNumber: dto.insurance_number!,
        holderName: dto.holder_name!,
      });
      chifa =
        check.status === 'VERIFIED' && check.source
          ? { status: 'VERIFIED', via: check.source }
          : check.status === 'NOT_FOUND'
            ? { status: 'FAILED', via: check.source }
            : { status: 'NOT_VERIFIED', via: null };
    }

    const expiryHours = await this.settings.get('request_expiry_hours');
    const year = new Date().getUTCFullYear();

    const requestId = await this.uow.run(async (ctx) => {
      const { tx } = ctx;
      const [consent] = await tx
        .insert(consentRecords)
        .values({
          userId: user.id,
          consentType: 'SHARE_PRESCRIPTION_WITH_PHARMACY',
          version: SHARE_CONSENT_VERSION,
          ip: meta.ip,
        })
        .returning({ id: consentRecords.id });
      const [{ seq }] = await tx
        .execute<{ seq: string }>(
          sql`SELECT nextval('request_reference_seq')::text AS seq`,
        )
        .then((r) => r.rows);
      const [req] = await tx
        .insert(requests)
        .values({
          reference: `RX-${year}-${seq.padStart(6, '0')}`,
          patientUserId: user.id,
          dependantId: dto.dependant_id,
          requestType: dto.request_type,
          status: 'REQUEST_SUBMITTED',
          urgency: dto.urgency ?? 'NORMAL',
          addressId: address.id,
          deliveryAddressSnapshot: {
            label: address.label,
            wilaya_id: address.wilaya_id,
            wilaya_name_fr: address.wilaya_name_fr,
            wilaya_name_ar: address.wilaya_name_ar,
            commune_id: address.commune_id,
            commune_name_fr: address.commune_name_fr,
            commune_name_ar: address.commune_name_ar,
            street_line: address.street_line,
            building_details: address.building_details,
            latitude: address.latitude,
            longitude: address.longitude,
            phone_contact: address.phone_contact,
            delivery_notes: address.delivery_notes,
          },
          patientNote: dto.patient_note,
          deliveryWanted: dto.delivery_wanted,
          consentRecordId: consent.id,
          expiresAt: new Date(Date.now() + expiryHours * 3_600_000),
        })
        .returning();

      if (fileIds.length) {
        await tx.insert(requestFiles).values(
          fileIds.map((fileId, i) => ({
            requestId: req.id,
            fileId,
            pageOrder: i + 1,
          })),
        );
      }
      if (items.length)
        await tx
          .insert(requestItems)
          .values(items.map((i) => this.itemValues(req.id, i)));
      if (chifa) {
        await tx.insert(chifaSubmissions).values({
          requestId: req.id,
          cardFileId: dto.card_file_id,
          insuranceNumberEncrypted: this.crypto.encrypt(dto.insurance_number!),
          holderName: dto.holder_name,
          verificationStatus: chifa.status,
          verifiedVia: chifa.via,
          verifiedAt: chifa.status === 'VERIFIED' ? new Date() : null,
        });
      }
      await tx.insert(requestRecipients).values(
        recipients.map((p) => ({
          requestId: req.id,
          pharmacyId: p.id,
          status: 'SENT' as const,
        })),
      );

      await this.audit.log(
        {
          action: 'REQUEST_CREATED',
          actorUserId: user.id,
          actorRole: user.role,
          resourceType: 'request',
          resourceId: req.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: {
            request_type: dto.request_type,
            recipients: recipients.length,
            mode: dto.pharmacy_ids?.length ? 'PATIENT_CHOICE' : 'AUTOMATIC',
            files: fileIds.length,
          },
        },
        tx,
      );
      ctx.emit(DomainEvent.REQUEST_CREATED, {
        requestId: req.id,
        pharmacyIds: recipients.map((p) => p.id),
      });
      await this.lifecycle.transition(ctx, req, 'AWAITING_PHARMACY_RESPONSE', {
        userId: user.id,
        role: user.role,
      });
      return req.id;
    });

    // Advisory OCR runs in the background and never changes the status.
    if (fileIds.length && (await this.settings.get('ocr_enabled'))) {
      const rf = await this.db
        .select({ id: requestFiles.id })
        .from(requestFiles)
        .where(eq(requestFiles.requestId, requestId));
      for (const row of rf)
        await this.jobs.enqueue(OCR_JOB, { requestFileId: row.id });
    }
    return this.detail(user, requestId);
  }

  private itemValues(requestId: string, i: RequestItemInputDto) {
    return {
      requestId,
      rawName: i.raw_name,
      medicineId: i.medicine_id ?? null,
      quantity: i.quantity ?? 1,
      dosageText: i.dosage_text ?? null,
      source: 'PATIENT' as const,
    };
  }

  // ------------------------------------------------------------------- read

  async findOwned(userId: string, id: string): Promise<RequestRow> {
    const [r] = await this.db
      .select()
      .from(requests)
      .where(and(eq(requests.id, id), eq(requests.patientUserId, userId)))
      .limit(1);
    if (!r) throw new AppException('REQUEST_NOT_FOUND');
    return r;
  }

  async list(user: AuthUser, q: RequestsQueryDto) {
    const conditions: SQL[] = [eq(requests.patientUserId, user.id)];
    if (q.status?.length) conditions.push(inArray(requests.status, q.status));
    if (q.request_type)
      conditions.push(eq(requests.requestType, q.request_type));
    if (q.from) conditions.push(gte(requests.createdAt, new Date(q.from)));
    if (q.to) conditions.push(lt(requests.createdAt, new Date(q.to)));
    const where = and(...conditions);
    const sortCol =
      q.sort === 'expires_at' ? requests.expiresAt : requests.createdAt;

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          r: requests,
          dependantFirstName: dependants.firstName,
          recipients: sql<number>`(SELECT count(*)::int FROM ${requestRecipients} rr WHERE rr.request_id = ${requests.id})`,
          offersCount: sql<number>`(SELECT count(*)::int FROM ${offers} o WHERE o.request_id = ${requests.id} AND o.status IN ('SENT','ACCEPTED'))`,
        })
        .from(requests)
        .leftJoin(dependants, eq(dependants.id, requests.dependantId))
        .where(where)
        .orderBy(q.order === 'asc' ? asc(sortCol) : desc(sortCol))
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(requests).where(where),
    ]);
    const items: RequestSummaryDto[] = rows.map((row) =>
      this.summary(
        row.r,
        row.dependantFirstName,
        row.recipients,
        row.offersCount,
      ),
    );
    return Paginated.of(items, total, q.page, q.limit);
  }

  private summary(
    r: RequestRow,
    dependantFirstName: string | null,
    recipients: number,
    offersCount: number,
  ): RequestSummaryDto {
    return {
      id: r.id,
      reference: r.reference,
      request_type: r.requestType,
      status: r.status,
      urgency: r.urgency,
      delivery_wanted: r.deliveryWanted,
      dependant_first_name: dependantFirstName,
      recipients_count: Number(recipients),
      offers_count: Number(offersCount),
      expires_at: r.expiresAt,
      created_at: r.createdAt,
    };
  }

  async detail(user: AuthUser, id: string): Promise<RequestDetailDto> {
    const r = await this.findOwned(user.id, id);
    const [filesRows, itemRows, recipientRows, chifaRows, offerRows, dep] =
      await Promise.all([
        this.db
          .select()
          .from(requestFiles)
          .where(eq(requestFiles.requestId, id))
          .orderBy(asc(requestFiles.pageOrder)),
        this.db
          .select()
          .from(requestItems)
          .where(eq(requestItems.requestId, id))
          .orderBy(asc(requestItems.createdAt)),
        this.db
          .select({
            rr: requestRecipients,
            nameFr: pharmacies.nameFr,
            nameAr: pharmacies.nameAr,
          })
          .from(requestRecipients)
          .innerJoin(
            pharmacies,
            eq(pharmacies.id, requestRecipients.pharmacyId),
          )
          .where(eq(requestRecipients.requestId, id))
          .orderBy(asc(requestRecipients.sentAt)),
        this.db
          .select()
          .from(chifaSubmissions)
          .where(eq(chifaSubmissions.requestId, id))
          .limit(1),
        this.db
          .select({ id: offers.id, total: offers.totalCentimes })
          .from(offers)
          .where(
            and(
              eq(offers.requestId, id),
              inArray(offers.status, ['SENT', 'ACCEPTED']),
            ),
          ),
        r.dependantId
          ? this.db
              .select({ firstName: dependants.firstName })
              .from(dependants)
              .where(eq(dependants.id, r.dependantId))
              .limit(1)
          : Promise.resolve([] as { firstName: string }[]),
      ]);
    const chifa = chifaRows[0];
    return {
      ...this.summary(
        r,
        dep[0]?.firstName ?? null,
        recipientRows.length,
        offerRows.length,
      ),
      patient_note: r.patientNote,
      delivery_address:
        (r.deliveryAddressSnapshot as Record<string, unknown>) ?? null,
      dependant_id: r.dependantId,
      prescription_submitted: filesRows.length > 0,
      chifa_info_submitted: !!chifa,
      coverage_verified: {
        verified: chifa?.verificationStatus === 'VERIFIED',
        source:
          chifa?.verificationStatus === 'VERIFIED' ? chifa.verifiedVia : null,
        status: chifa?.verificationStatus ?? 'NOT_VERIFIED',
      },
      files: filesRows.map((f) => ({
        file_id: f.fileId,
        page_order: f.pageOrder,
        quality_status: f.qualityStatus,
      })),
      items: itemRows.map((i) => ({
        id: i.id,
        raw_name: i.rawName,
        medicine_id: i.medicineId,
        quantity: i.quantity,
        dosage_text: i.dosageText,
        source: i.source,
        ocr_confidence: i.ocrConfidence,
        confirmed_by_pharmacist: i.confirmedByPharmacist,
      })),
      recipients: recipientRows.map(({ rr, nameFr, nameAr }) => ({
        pharmacy_id: rr.pharmacyId,
        pharmacy_name_fr: nameFr,
        pharmacy_name_ar: nameAr,
        status: rr.status,
        sent_at: rr.sentAt,
        viewed_at: rr.viewedAt,
        responded_at: rr.respondedAt,
      })),
      offers_summary: {
        count: offerRows.length,
        best_total_centimes: offerRows.length
          ? Math.min(...offerRows.map((o) => o.total))
          : null,
        offer_ids: offerRows.map((o) => o.id),
      },
      cancelled_at: r.cancelledAt,
      cancel_reason: r.cancelReason,
      updated_at: r.updatedAt,
    };
  }

  // ------------------------------------------------------------------ items

  private async editableRequest(user: AuthUser, id: string) {
    const r = await this.findOwned(user.id, id);
    if (!EDITABLE_ITEM_STATUSES.includes(r.status))
      throw new AppException('REQUEST_NOT_EDITABLE');
    return r;
  }

  private async assertItemsAllowed(r: RequestRow, medicineIds: string[]) {
    if (medicineIds.length) {
      await this.eligibility.assertRequestAllowed({
        requestType: r.requestType,
        medicineIds,
        deliveryWanted: r.deliveryWanted,
      });
    }
  }

  async addItem(user: AuthUser, id: string, dto: RequestItemInputDto) {
    const r = await this.editableRequest(user, id);
    await this.assertItemsAllowed(r, dto.medicine_id ? [dto.medicine_id] : []);
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(requestItems)
      .where(eq(requestItems.requestId, id));
    if (n >= 30)
      throw new AppException('VALIDATION_FAILED', [
        {
          field: 'items',
          errors: [
            { rule: 'arrayMaxSize', message_key: 'validation.arrayMaxSize' },
          ],
        },
      ]);
    await this.db.insert(requestItems).values(this.itemValues(id, dto));
    return this.detail(user, id);
  }

  private async editableItem(requestId: string, itemId: string) {
    const [item] = await this.db
      .select()
      .from(requestItems)
      .where(
        and(eq(requestItems.id, itemId), eq(requestItems.requestId, requestId)),
      )
      .limit(1);
    if (!item) throw new AppException('REQUEST_ITEM_NOT_FOUND');
    if (item.confirmedByPharmacist)
      throw new AppException('REQUEST_ITEM_LOCKED');
    return item;
  }

  /** Editing an OCR suggestion turns it into a patient-entered item. */
  async updateItem(
    user: AuthUser,
    id: string,
    itemId: string,
    dto: UpdateRequestItemDto,
  ) {
    const r = await this.editableRequest(user, id);
    await this.editableItem(id, itemId);
    await this.assertItemsAllowed(r, dto.medicine_id ? [dto.medicine_id] : []);
    await this.db
      .update(requestItems)
      .set({
        rawName: dto.raw_name,
        medicineId: dto.medicine_id,
        quantity: dto.quantity,
        dosageText: dto.dosage_text,
        source: 'PATIENT',
        ocrConfidence: null,
      })
      .where(eq(requestItems.id, itemId));
    return this.detail(user, id);
  }

  async deleteItem(user: AuthUser, id: string, itemId: string) {
    await this.editableRequest(user, id);
    await this.editableItem(id, itemId);
    await this.db.delete(requestItems).where(eq(requestItems.id, itemId));
    return this.detail(user, id);
  }

  // ----------------------------------------------------------------- cancel

  async cancel(
    user: AuthUser,
    id: string,
    reason: string | undefined,
    meta: RequestMeta,
  ) {
    const r = await this.findOwned(user.id, id);
    if (r.status === 'OFFER_ACCEPTED') {
      const [active] = await this.db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.requestId, id),
            notInArray(orders.status, [...INACTIVE_ORDER_STATUSES]),
          ),
        )
        .limit(1);
      if (active)
        throw new AppException('REQUEST_HAS_ORDER', { order_id: active.id });
    } else if (!OPEN_REQUEST_STATUSES.includes(r.status)) {
      throw new AppException('REQUEST_NOT_CANCELLABLE');
    }
    const ok = await this.uow.run((ctx) =>
      this.lifecycle.transition(
        ctx,
        r,
        'CANCELLED',
        { userId: user.id, role: user.role, reason: reason ?? null },
        { cancelledAt: new Date(), cancelReason: reason ?? null },
      ),
    );
    if (!ok) throw new AppException('REQUEST_NOT_CANCELLABLE');
    await this.audit.log({
      action: 'REQUEST_CANCELLED',
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'request',
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return this.detail(user, id);
  }

  // ----------------------------------------------------------------- expiry

  /** Expires open requests past expires_at. Returns how many were expired. */
  async expireDue(now = new Date()): Promise<number> {
    const due = await this.db
      .select()
      .from(requests)
      .where(
        and(
          inArray(requests.status, OPEN_REQUEST_STATUSES),
          lt(requests.expiresAt, now),
          isNull(requests.cancelledAt),
        ),
      )
      .limit(500);
    let expired = 0;
    for (const r of due) {
      const ok = await this.uow.run((ctx) =>
        this.lifecycle.transition(ctx, r, 'EXPIRED', {
          userId: null,
          role: null,
          reason: 'request_expiry_job',
        }),
      );
      if (ok) expired++;
    }
    return expired;
  }
}
