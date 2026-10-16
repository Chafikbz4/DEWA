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
  sql,
  SQL,
} from 'drizzle-orm';
import { AuthUser, PharmacyContext } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import { UnitOfWork } from '../../common/events/unit-of-work';
import { Paginated } from '../../common/http/envelope';
import { Database, DbOrTx, DRIZZLE } from '../../database/database.module';
import {
  chifaSubmissions,
  consentRecords,
  conversations,
  dependants,
  offers,
  patientProfiles,
  pharmacies,
  requestFiles,
  requestItems,
  requestRecipients,
  requests,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { SensitiveAccessService } from '../audit/sensitive-access.service';
import { ConversationsService } from '../messaging/conversations.service';
import { RequestLifecycleService } from '../requests/request-lifecycle.service';
import { InboxQueryDto } from './dto/inbox.dto';

type RecipientStatus = (typeof requestRecipients.$inferSelect)['status'];
/** Recipient statuses in which the pharmacy can still act. */
export const ACTIVE_RECIPIENT: RecipientStatus[] = [
  'SENT',
  'VIEWED',
  'INTERESTED',
  'CLARIFICATION_ASKED',
  'OFFERED',
];
const OPEN_FOR_PHARMACY = [
  'AWAITING_PHARMACY_RESPONSE',
  'CLARIFICATION_REQUIRED',
  'OFFER_AVAILABLE',
] as const;

@Injectable()
export class InboxService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly uow: UnitOfWork,
    private readonly lifecycle: RequestLifecycleService,
    private readonly conversations: ConversationsService,
    private readonly sensitive: SensitiveAccessService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async list(ph: PharmacyContext, q: InboxQueryDto) {
    const conditions: SQL[] = [eq(requestRecipients.pharmacyId, ph.id)];
    if (q.recipient_status?.length)
      conditions.push(inArray(requestRecipients.status, q.recipient_status));
    if (q.request_status?.length)
      conditions.push(inArray(requests.status, q.request_status));
    if (q.urgency) conditions.push(eq(requests.urgency, q.urgency));
    if (q.from)
      conditions.push(gte(requestRecipients.sentAt, new Date(q.from)));
    if (q.to) conditions.push(lt(requestRecipients.sentAt, new Date(q.to)));
    const where = and(...conditions);
    const sortCol =
      q.sort === 'expires_at' ? requests.expiresAt : requestRecipients.sentAt;

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          rr: requestRecipients,
          r: requests,
          patientFirstName: patientProfiles.firstName,
          itemsCount: sql<number>`(SELECT count(*)::int FROM ${requestItems} i WHERE i.request_id = ${requests.id})`,
          filesCount: sql<number>`(SELECT count(*)::int FROM ${requestFiles} f WHERE f.request_id = ${requests.id})`,
          myOffer: sql<
            string | null
          >`(SELECT o.status::text FROM ${offers} o WHERE o.request_id = ${requests.id} AND o.pharmacy_id = ${ph.id} ORDER BY o.created_at DESC LIMIT 1)`,
        })
        .from(requestRecipients)
        .innerJoin(requests, eq(requests.id, requestRecipients.requestId))
        .leftJoin(
          patientProfiles,
          eq(patientProfiles.userId, requests.patientUserId),
        )
        .where(where)
        .orderBy(
          desc(sql`(${requests.urgency} = 'URGENT')`),
          q.order === 'asc' ? asc(sortCol) : desc(sortCol),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db
        .select({ total: count() })
        .from(requestRecipients)
        .innerJoin(requests, eq(requests.id, requestRecipients.requestId))
        .where(where),
    ]);
    return Paginated.of(
      rows.map((row) => {
        const area = (row.r.deliveryAddressSnapshot ?? {}) as Record<
          string,
          unknown
        >;
        return {
          request_id: row.r.id,
          reference: row.r.reference,
          request_type: row.r.requestType,
          urgency: row.r.urgency,
          request_status: row.r.status,
          recipient_status: row.rr.status,
          delivery_wanted: row.r.deliveryWanted,
          patient_first_name: row.patientFirstName,
          commune_name_fr: (area.commune_name_fr as string) ?? null,
          commune_name_ar: (area.commune_name_ar as string) ?? null,
          items_count: Number(row.itemsCount),
          files_count: Number(row.filesCount),
          my_offer_status: row.myOffer,
          sent_at: row.rr.sentAt,
          viewed_at: row.rr.viewedAt,
          expires_at: row.r.expiresAt,
        };
      }),
      total,
      q.page,
      q.limit,
    );
  }

  private async recipientOf(
    ph: PharmacyContext,
    requestId: string,
    tx: DbOrTx = this.db,
  ) {
    const [row] = await tx
      .select({ rr: requestRecipients, r: requests })
      .from(requestRecipients)
      .innerJoin(requests, eq(requests.id, requestRecipients.requestId))
      .where(
        and(
          eq(requestRecipients.requestId, requestId),
          eq(requestRecipients.pharmacyId, ph.id),
        ),
      )
      .limit(1);
    if (!row) throw new AppException('REQUEST_NOT_FOUND');
    return row;
  }

  /**
   * Request detail for the pharmacy: patient FIRST NAME only, items, file ids
   * (content only via signed URL for OWNER/PHARMACIST with active consent),
   * delivery AREA (no street before an order). Marks the request viewed and
   * logs a sensitive access.
   */
  async detail(
    user: AuthUser,
    ph: PharmacyContext,
    requestId: string,
    meta: RequestMeta,
  ) {
    const { rr, r } = await this.recipientOf(ph, requestId);
    const now = new Date();
    if (!rr.viewedAt) {
      await this.db
        .update(requestRecipients)
        .set({
          viewedAt: now,
          status: rr.status === 'SENT' ? 'VIEWED' : rr.status,
        })
        .where(eq(requestRecipients.id, rr.id));
      rr.viewedAt = now;
      if (rr.status === 'SENT') rr.status = 'VIEWED';
    }
    await this.sensitive.record(user, 'PRESCRIPTION', r.id, {
      ip: meta.ip,
      userAgent: meta.userAgent,
      detail: 'pharmacy-request-detail',
    });

    const [patient, dep, items, files, chifaRows, consent, myOffer, conv] =
      await Promise.all([
        this.db
          .select({ firstName: patientProfiles.firstName })
          .from(patientProfiles)
          .where(eq(patientProfiles.userId, r.patientUserId))
          .limit(1),
        r.dependantId
          ? this.db
              .select({
                firstName: dependants.firstName,
                relationship: dependants.relationship,
              })
              .from(dependants)
              .where(eq(dependants.id, r.dependantId))
              .limit(1)
          : Promise.resolve([]),
        this.db
          .select()
          .from(requestItems)
          .where(eq(requestItems.requestId, r.id))
          .orderBy(asc(requestItems.createdAt)),
        this.db
          .select()
          .from(requestFiles)
          .where(eq(requestFiles.requestId, r.id))
          .orderBy(asc(requestFiles.pageOrder)),
        this.db
          .select()
          .from(chifaSubmissions)
          .where(eq(chifaSubmissions.requestId, r.id))
          .limit(1),
        r.consentRecordId
          ? this.db
              .select({ revokedAt: consentRecords.revokedAt })
              .from(consentRecords)
              .where(eq(consentRecords.id, r.consentRecordId))
              .limit(1)
          : Promise.resolve([]),
        this.db
          .select({
            id: offers.id,
            status: offers.status,
            total: offers.totalCentimes,
          })
          .from(offers)
          .where(and(eq(offers.requestId, r.id), eq(offers.pharmacyId, ph.id)))
          .orderBy(desc(offers.createdAt))
          .limit(1),
        this.db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.requestId, r.id),
              eq(conversations.pharmacyId, ph.id),
            ),
          )
          .limit(1),
      ]);
    const clinical = ph.staffRole === 'OWNER' || ph.staffRole === 'PHARMACIST';
    const consentActive = !!consent[0] && !consent[0].revokedAt;
    const chifa = chifaRows[0];
    let insuranceMasked: string | null = null;
    if (chifa?.insuranceNumberEncrypted && clinical) {
      try {
        insuranceMasked = CryptoService.mask(
          this.crypto.decrypt(chifa.insuranceNumberEncrypted),
        );
      } catch {
        insuranceMasked = '****';
      }
    }
    const area = (r.deliveryAddressSnapshot ?? {}) as Record<string, unknown>;
    return {
      request_id: r.id,
      reference: r.reference,
      request_type: r.requestType,
      urgency: r.urgency,
      request_status: r.status,
      recipient_status: rr.status,
      delivery_wanted: r.deliveryWanted,
      sent_at: rr.sentAt,
      viewed_at: rr.viewedAt,
      expires_at: r.expiresAt,
      patient: { first_name: patient[0]?.firstName ?? null },
      dependant: dep[0]
        ? { first_name: dep[0].firstName, relationship: dep[0].relationship }
        : null,
      patient_note: r.patientNote,
      delivery_area: {
        wilaya_name_fr: area.wilaya_name_fr ?? null,
        wilaya_name_ar: area.wilaya_name_ar ?? null,
        commune_name_fr: area.commune_name_fr ?? null,
        commune_name_ar: area.commune_name_ar ?? null,
      },
      items: items.map((i) => ({
        id: i.id,
        raw_name: i.rawName,
        medicine_id: i.medicineId,
        quantity: i.quantity,
        dosage_text: i.dosageText,
        source: i.source,
        ocr_confidence: i.ocrConfidence,
        confirmed_by_pharmacist: i.confirmedByPharmacist,
      })),
      files: files.map((f) => ({
        file_id: f.fileId,
        page_order: f.pageOrder,
        quality_status: f.qualityStatus,
      })),
      can_view_prescription:
        clinical && consentActive && ACTIVE_RECIPIENT.includes(rr.status),
      chifa: chifa
        ? {
            submitted: true,
            card_file_id: clinical ? chifa.cardFileId : null,
            holder_name: clinical ? chifa.holderName : null,
            insurance_number_masked: insuranceMasked,
            coverage_verified: {
              verified: chifa.verificationStatus === 'VERIFIED',
              source:
                chifa.verificationStatus === 'VERIFIED'
                  ? chifa.verifiedVia
                  : null,
              status: chifa.verificationStatus,
            },
          }
        : null,
      my_offer: myOffer[0]
        ? {
            id: myOffer[0].id,
            status: myOffer[0].status,
            total_centimes: myOffer[0].total,
          }
        : null,
      conversation_id: conv[0]?.id ?? null,
    };
  }

  private assertActionable(
    rr: typeof requestRecipients.$inferSelect,
    r: typeof requests.$inferSelect,
  ) {
    if (
      !ACTIVE_RECIPIENT.includes(rr.status) ||
      !(OPEN_FOR_PHARMACY as readonly string[]).includes(r.status)
    ) {
      throw new AppException('RECIPIENT_CLOSED', {
        recipient_status: rr.status,
        request_status: r.status,
      });
    }
  }

  /** Signals interest. Does NOT authorize dispensing and does NOT create an order. */
  async acceptInterest(
    user: AuthUser,
    ph: PharmacyContext,
    requestId: string,
    meta: RequestMeta,
  ) {
    const { rr, r } = await this.recipientOf(ph, requestId);
    this.assertActionable(rr, r);
    if (rr.status === 'SENT' || rr.status === 'VIEWED') {
      await this.db
        .update(requestRecipients)
        .set({
          status: 'INTERESTED',
          viewedAt: rr.viewedAt ?? new Date(),
          respondedAt: rr.respondedAt ?? new Date(),
        })
        .where(eq(requestRecipients.id, rr.id));
      await this.refreshResponseTime(this.db, ph.id);
    }
    await this.audit.log({
      action: 'PHARMACY_REQUEST_INTEREST',
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'request',
      resourceId: r.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return {
      request_id: r.id,
      recipient_status:
        rr.status === 'SENT' || rr.status === 'VIEWED'
          ? 'INTERESTED'
          : rr.status,
    };
  }

  async decline(
    user: AuthUser,
    ph: PharmacyContext,
    requestId: string,
    reason: string,
    meta: RequestMeta,
  ) {
    const { rr, r } = await this.recipientOf(ph, requestId);
    if (!ACTIVE_RECIPIENT.includes(rr.status) || rr.status === 'OFFERED') {
      throw new AppException('RECIPIENT_CLOSED', {
        recipient_status: rr.status,
      });
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(requestRecipients)
        .set({
          status: 'DECLINED',
          declineReason: reason,
          respondedAt: rr.respondedAt ?? new Date(),
        })
        .where(eq(requestRecipients.id, rr.id));
      // Drop any draft quote.
      await tx
        .update(offers)
        .set({ status: 'WITHDRAWN', withdrawnAt: new Date() })
        .where(
          and(
            eq(offers.requestId, r.id),
            eq(offers.pharmacyId, ph.id),
            eq(offers.status, 'DRAFT'),
          ),
        );
      await this.refreshResponseTime(tx, ph.id);
      await this.audit.log(
        {
          action: 'PHARMACY_REQUEST_DECLINED',
          actorUserId: user.id,
          actorRole: user.role,
          resourceType: 'request',
          resourceId: r.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
        tx,
      );
    });
    return { request_id: r.id, recipient_status: 'DECLINED' };
  }

  /** Posts a clarification question; the request moves to CLARIFICATION_REQUIRED. */
  async clarification(
    user: AuthUser,
    ph: PharmacyContext,
    requestId: string,
    question: string,
    meta: RequestMeta,
  ) {
    const { rr, r } = await this.recipientOf(ph, requestId);
    this.assertActionable(rr, r);
    const result = await this.uow.run(async (ctx) => {
      const conv = await this.conversations.ensure(
        ctx.tx,
        r.id,
        ph.id,
        r.patientUserId,
      );
      const message = await this.conversations.post(ctx, conv, {
        senderUserId: user.id,
        type: 'CLARIFICATION_QUESTION',
        body: question,
      });
      await ctx.tx
        .update(requestRecipients)
        .set({
          status: rr.status === 'OFFERED' ? 'OFFERED' : 'CLARIFICATION_ASKED',
          viewedAt: rr.viewedAt ?? new Date(),
          respondedAt: rr.respondedAt ?? new Date(),
        })
        .where(eq(requestRecipients.id, rr.id));
      if (r.status !== 'CLARIFICATION_REQUIRED') {
        const ok = await this.lifecycle.transition(
          ctx,
          r,
          'CLARIFICATION_REQUIRED',
          { userId: user.id, role: user.role },
        );
        if (!ok) throw new AppException('CLARIFICATION_NOT_ALLOWED');
      }
      await this.refreshResponseTime(ctx.tx, ph.id);
      await this.audit.log(
        {
          action: 'PHARMACY_CLARIFICATION_ASKED',
          actorUserId: user.id,
          actorRole: user.role,
          resourceType: 'request',
          resourceId: r.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: { conversation_id: conv.id },
        },
        ctx.tx,
      );
      return { conversation_id: conv.id, message_id: message.id };
    });
    return {
      request_id: r.id,
      request_status: 'CLARIFICATION_REQUIRED',
      ...result,
    };
  }

  /** Average minutes between a request reaching the pharmacy and its first response. */
  async refreshResponseTime(tx: DbOrTx, pharmacyId: string) {
    await tx
      .update(pharmacies)
      .set({
        avgResponseMinutes: sql`(SELECT round(avg(extract(epoch FROM (rr.responded_at - rr.sent_at)) / 60))::int FROM ${requestRecipients} rr WHERE rr.pharmacy_id = ${pharmacyId} AND rr.responded_at IS NOT NULL)`,
      })
      .where(eq(pharmacies.id, pharmacyId));
  }

  /** Request ids where this pharmacy is an active recipient (used by other modules). */
  async isActiveRecipient(
    pharmacyId: string,
    requestId: string,
    tx: DbOrTx = this.db,
  ) {
    const [row] = await tx
      .select({ id: requestRecipients.id })
      .from(requestRecipients)
      .where(
        and(
          eq(requestRecipients.pharmacyId, pharmacyId),
          eq(requestRecipients.requestId, requestId),
          inArray(requestRecipients.status, ACTIVE_RECIPIENT),
          isNull(requestRecipients.declineReason),
        ),
      )
      .limit(1);
    return !!row;
  }
}
