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
import { NotificationsService } from '../notifications/notifications.service';
import { RequestLifecycleService } from '../requests/request-lifecycle.service';
import { InboxQueryDto } from './dto/inbox.dto';

type RecipientStatus = (typeof requestRecipients.$inferSelect)['status'];
/** Recipient statuses in which the pharmacy can still act. */
export const ACTIVE_RECIPIENT: RecipientStatus[] = [
  'SENT',
  'VIEWED',
  'ACCEPTED',
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
    private readonly notifications: NotificationsService,
  ) {}

  async list(ph: PharmacyContext, q: InboxQueryDto) {
    const [pharmacy] = await this.db
      .select({ wilayaId: pharmacies.wilayaId })
      .from(pharmacies)
      .where(eq(pharmacies.id, ph.id))
      .limit(1);
    if (!pharmacy) throw new AppException('REQUEST_NOT_FOUND');
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

    const [rows, unassignedRows, [{ total }], [{ unassignedTotal }]] =
      await Promise.all([
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
          .select({
            r: requests,
            patientFirstName: patientProfiles.firstName,
            itemsCount: sql<number>`(SELECT count(*)::int FROM ${requestItems} i WHERE i.request_id = ${requests.id})`,
            filesCount: sql<number>`(SELECT count(*)::int FROM ${requestFiles} f WHERE f.request_id = ${requests.id})`,
            myOffer: sql<string | null>`NULL::text`,
          })
          .from(requests)
          .leftJoin(
            patientProfiles,
            eq(patientProfiles.userId, requests.patientUserId),
          )
          .where(
            and(
              eq(requests.status, 'AWAITING_PHARMACY_RESPONSE'),
              sql`${requests.deliveryAddressSnapshot}->>'wilaya_id' = ${String(pharmacy.wilayaId)}`,
              sql`NOT EXISTS (
              SELECT 1 FROM ${requestRecipients} rr
              WHERE rr.request_id = ${requests.id}
                AND rr.pharmacy_id = ${ph.id}
            )`,
              ...(q.urgency ? [eq(requests.urgency, q.urgency)] : []),
            ),
          )
          .orderBy(
            desc(sql`(${requests.urgency} = 'URGENT')`),
            desc(requests.createdAt),
          )
          .limit(q.limit + q.offset),
        this.db
          .select({ total: count() })
          .from(requestRecipients)
          .innerJoin(requests, eq(requests.id, requestRecipients.requestId))
          .where(where),
        this.db
          .select({ unassignedTotal: count() })
          .from(requests)
          .where(
            and(
              eq(requests.status, 'AWAITING_PHARMACY_RESPONSE'),
              sql`${requests.deliveryAddressSnapshot}->>'wilaya_id' = ${String(pharmacy.wilayaId)}`,
              sql`NOT EXISTS (
              SELECT 1 FROM ${requestRecipients} rr
              WHERE rr.request_id = ${requests.id}
                AND rr.pharmacy_id = ${ph.id}
            )`,
            ),
          ),
      ]);
    const allRows = [
      ...rows.map((row) => ({
        ...row,
        rr: row.rr,
        sentAt: row.rr.sentAt,
        viewedAt: row.rr.viewedAt,
        recipientStatus: row.rr.status,
      })),
      ...unassignedRows.map((row) => ({
        ...row,
        rr: null,
        sentAt: row.r.createdAt,
        viewedAt: null,
        recipientStatus: 'SENT' as const,
      })),
    ].sort((a, b) => {
      const urgent =
        Number(b.r.urgency === 'URGENT') - Number(a.r.urgency === 'URGENT');
      return urgent || b.sentAt.getTime() - a.sentAt.getTime();
    });
    const pageRows = allRows.slice(q.offset, q.offset + q.limit);
    return Paginated.of(
      pageRows.map((row) => {
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
          recipient_status: row.recipientStatus,
          delivery_wanted: row.r.deliveryWanted,
          patient_first_name: row.patientFirstName,
          commune_name_fr: (area.commune_name_fr as string) ?? null,
          commune_name_ar: (area.commune_name_ar as string) ?? null,
          items_count: Number(row.itemsCount),
          files_count: Number(row.filesCount),
          my_offer_status: row.myOffer,
          sent_at: row.sentAt,
          viewed_at: row.viewedAt,
          expires_at: row.r.expiresAt,
          accepted_amount_centimes: row.rr?.quotedAmountCentimes ?? null,
          fulfillment_type: row.rr?.fulfillmentType ?? null,
          delivery_company_id: row.rr?.deliveryCompanyId ?? null,
          delivery_company_name: row.rr?.deliveryCompanyName ?? null,
          payment_method: row.rr?.paymentMethod ?? null,
          payment_status: row.rr?.paymentStatus ?? null,
          paid_at: row.rr?.paidAt ?? null,
          checkout_completed_at: row.rr?.checkoutCompletedAt ?? null,
          fulfillment_status: row.rr?.fulfillmentStatus ?? null,
          fulfillment_updated_at: row.rr?.fulfillmentUpdatedAt ?? null,
        };
      }),
      Number(total) + Number(unassignedTotal),
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
    if (!row) {
      const [pharmacy] = await tx
        .select({ wilayaId: pharmacies.wilayaId })
        .from(pharmacies)
        .where(eq(pharmacies.id, ph.id))
        .limit(1);
      const [request] = await tx
        .select()
        .from(requests)
        .where(eq(requests.id, requestId))
        .limit(1);
      const area = (request?.deliveryAddressSnapshot ?? {}) as Record<
        string,
        unknown
      >;
      if (
        !pharmacy ||
        !request ||
        request.status !== 'AWAITING_PHARMACY_RESPONSE' ||
        String(area.wilaya_id) !== String(pharmacy.wilayaId)
      )
        throw new AppException('REQUEST_NOT_FOUND');
      const [recipient] = await tx
        .insert(requestRecipients)
        .values({
          requestId,
          pharmacyId: ph.id,
          status: 'SENT',
        })
        .onConflictDoNothing()
        .returning();
      if (!recipient) {
        const [existing] = await tx
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
        if (!existing) throw new AppException('REQUEST_NOT_FOUND');
        return existing;
      }
      return { rr: recipient, r: request };
    }
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
      quoted_amount_centimes: rr.quotedAmountCentimes,
      fulfillment_type: rr.fulfillmentType,
      delivery_company_id: rr.deliveryCompanyId,
      delivery_company_name: rr.deliveryCompanyName,
      payment_method: rr.paymentMethod,
      payment_status: rr.paymentStatus,
      paid_at: rr.paidAt,
      checkout_completed_at: rr.checkoutCompletedAt,
      fulfillment_status: rr.fulfillmentStatus,
      fulfillment_updated_at: rr.fulfillmentUpdatedAt,
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

  /** Accepts the request for this pharmacy; the first pharmacy to claim wins. */
  async acceptInterest(
    user: AuthUser,
    ph: PharmacyContext,
    requestId: string,
    amountCentimes: number,
    meta: RequestMeta,
  ) {
    const { rr, r } = await this.recipientOf(ph, requestId);
    this.assertActionable(rr, r);
    if (rr.status !== 'SENT' && rr.status !== 'VIEWED')
      return {
        request_id: r.id,
        recipient_status: rr.status,
        quoted_amount_centimes: rr.quotedAmountCentimes,
      };

    const now = new Date();
    const claimed = await this.uow.run(async (ctx) => {
      const { tx } = ctx;
      // The request row is the shared claim boundary. The NOT EXISTS guard
      // makes simultaneous pharmacy clicks resolve to one winner.
      const updated = await tx
        .update(requestRecipients)
        .set({
          status: 'ACCEPTED',
          quotedAmountCentimes: amountCentimes,
          viewedAt: rr.viewedAt ?? now,
          respondedAt: now,
        })
        .where(
          and(
            eq(requestRecipients.id, rr.id),
            inArray(requestRecipients.status, ['SENT', 'VIEWED']),
            eq(
              sql`(SELECT status FROM requests WHERE id = ${r.id})`,
              'AWAITING_PHARMACY_RESPONSE',
            ),
            sql`NOT EXISTS (
              SELECT 1 FROM request_recipients other
              WHERE other.request_id = ${r.id}
                AND other.status = 'ACCEPTED'
            )`,
          ),
        )
        .returning({ id: requestRecipients.id });
      if (!updated.length) return false;

      const [request] = await tx
        .select()
        .from(requests)
        .where(eq(requests.id, r.id))
        .limit(1);
      if (!request) return false;
      const transitioned = await this.lifecycle.transition(
        ctx,
        request,
        'ACCEPTED',
        { userId: user.id, role: user.role, reason: 'Accepted by pharmacy' },
      );
      if (!transitioned) return false;

      // Once claimed, other pharmacies must no longer be able to act on it.
      await tx
        .update(requestRecipients)
        .set({ status: 'EXPIRED', respondedAt: now })
        .where(
          and(
            eq(requestRecipients.requestId, r.id),
            sql`${requestRecipients.id} <> ${rr.id}`,
            inArray(requestRecipients.status, [
              'SENT',
              'VIEWED',
              'CLARIFICATION_ASKED',
            ]),
          ),
        );
      return true;
    });
    if (!claimed)
      throw new AppException('RECIPIENT_CLOSED', {
        recipient_status: rr.status,
        request_status: r.status,
      });
    await this.refreshResponseTime(this.db, ph.id);
    await this.audit.log({
      action: 'PHARMACY_REQUEST_ACCEPTED',
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'request',
      resourceId: r.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { amount_centimes: amountCentimes },
    });
    return {
      request_id: r.id,
      recipient_status: 'ACCEPTED',
      quoted_amount_centimes: amountCentimes,
    };
  }

  /**
   * Pharmacy confirms what happens next for the patient: hand the parcel to
   * the delivery company, mark a delivery as done, or mark a pickup as
   * collected. Order-backed requests keep their own state machine; these
   * statuses mirror the operational steps for the request flow.
   */
  async updateFulfillment(
    user: AuthUser,
    ph: PharmacyContext,
    requestId: string,
    status:
      'PREPARING' | 'READY' | 'HANDED_TO_DELIVERY' | 'DELIVERED' | 'PICKED_UP',
    meta: RequestMeta,
  ) {
    const { rr, r } = await this.recipientOf(ph, requestId);
    if (rr.status !== 'ACCEPTED')
      throw new AppException('RECIPIENT_CLOSED', {
        recipient_status: rr.status,
        request_status: r.status,
      });
    if (r.status !== 'ACCEPTED' && r.status !== 'OFFER_ACCEPTED')
      throw new AppException('REQUEST_NOT_EDITABLE', { status: r.status });
    if (!rr.fulfillmentType || !rr.checkoutCompletedAt)
      throw new AppException('REQUEST_NOT_EDITABLE', {
        reason: 'patient_checkout_pending',
      });

    const current = rr.fulfillmentStatus;
    if (current === status)
      return {
        request_id: r.id,
        fulfillment_status: status,
        fulfillment_updated_at: rr.fulfillmentUpdatedAt,
        payment_status: rr.paymentStatus,
        paid_at: rr.paidAt,
      };

    if (current === 'DELIVERED' || current === 'PICKED_UP')
      throw new AppException('REQUEST_NOT_EDITABLE', {
        from: current,
        to: status,
      });
    if (status === 'DELIVERED' && current !== 'HANDED_TO_DELIVERY')
      throw new AppException('REQUEST_NOT_EDITABLE', {
        reason: 'hand_over_to_delivery_first',
        from: current,
        to: status,
      });
    if (
      current === 'HANDED_TO_DELIVERY' &&
      status !== 'DELIVERED' &&
      status !== 'HANDED_TO_DELIVERY'
    )
      throw new AppException('REQUEST_NOT_EDITABLE', {
        from: current,
        to: status,
      });
    if (status === 'READY' && current !== null && current !== 'PREPARING')
      throw new AppException('REQUEST_NOT_EDITABLE', {
        from: current,
        to: status,
      });
    if (status === 'PREPARING' && current !== null && current !== 'PREPARING')
      throw new AppException('REQUEST_NOT_EDITABLE', {
        from: current,
        to: status,
      });

    const needsDelivery =
      status === 'HANDED_TO_DELIVERY' || status === 'DELIVERED';
    if (needsDelivery && rr.fulfillmentType !== 'DELIVERY')
      throw new AppException('REQUEST_NOT_EDITABLE', {
        reason: 'not_a_delivery_request',
      });
    if (status === 'PICKED_UP' && rr.fulfillmentType !== 'PICKUP')
      throw new AppException('REQUEST_NOT_EDITABLE', {
        reason: 'not_a_pickup_request',
      });

    const now = new Date();
    const settled = status === 'PICKED_UP' || status === 'DELIVERED';
    const paidAt = settled ? (rr.paidAt ?? now) : rr.paidAt;
    await this.db
      .update(requestRecipients)
      .set({
        fulfillmentStatus: status,
        fulfillmentUpdatedAt: now,
        ...(settled
          ? { paymentStatus: 'PAID' as const, paidAt: rr.paidAt ?? now }
          : {}),
      })
      .where(eq(requestRecipients.id, rr.id));

    await this.audit.log({
      action: 'PHARMACY_FULFILLMENT_UPDATED',
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'request',
      resourceId: r.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        pharmacy_id: ph.id,
        from: current,
        to: status,
        fulfillment_type: rr.fulfillmentType,
        delivery_company_name: rr.deliveryCompanyName,
      },
    });

    const orderStatusForNotification = {
      PREPARING: 'PREPARING',
      READY: 'READY_FOR_PICKUP',
      HANDED_TO_DELIVERY: 'OUT_FOR_DELIVERY',
      DELIVERED: 'DELIVERED',
      PICKED_UP: 'COMPLETED',
    } as const;
    try {
      await this.notifications.notify({
        userIds: [r.patientUserId],
        type: 'ORDER_STATUS_CHANGED',
        params: {
          reference: r.reference,
          status: orderStatusForNotification[status],
        },
        data: { request_id: r.id },
      });
    } catch {
      // A failed notification must not undo the fulfillment update.
    }

    return {
      request_id: r.id,
      fulfillment_status: status,
      fulfillment_updated_at: now,
      payment_status: settled ? 'PAID' : rr.paymentStatus,
      paid_at: paidAt,
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
    await this.uow.run(async (ctx) => {
      const { tx } = ctx;
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
      const [{ remaining }] = await tx
        .select({
          remaining: sql<number>`count(*) FILTER (WHERE ${requestRecipients.status} IN ('SENT', 'VIEWED', 'ACCEPTED', 'CLARIFICATION_ASKED', 'OFFERED'))::int`,
        })
        .from(requestRecipients)
        .where(eq(requestRecipients.requestId, r.id));
      const area = (r.deliveryAddressSnapshot ?? {}) as Record<string, unknown>;
      const [{ eligiblePharmacies }] = await tx
        .select({ eligiblePharmacies: count() })
        .from(pharmacies)
        .where(
          and(
            eq(pharmacies.status, 'VERIFIED'),
            eq(pharmacies.acceptsRequests, true),
            sql`${pharmacies.wilayaId} = ${Number(area.wilaya_id)}`,
          ),
        );
      const [{ declinedRecipients }] = await tx
        .select({ declinedRecipients: count() })
        .from(requestRecipients)
        .where(
          and(
            eq(requestRecipients.requestId, r.id),
            eq(requestRecipients.status, 'DECLINED'),
          ),
        );
      if (
        Number(eligiblePharmacies) > 0 &&
        Number(remaining) === 0 &&
        Number(declinedRecipients) >= Number(eligiblePharmacies) &&
        r.status === 'AWAITING_PHARMACY_RESPONSE'
      ) {
        await this.lifecycle.transition(ctx, r, 'REJECTED', {
          userId: user.id,
          role: user.role,
          reason: 'All pharmacies declined',
        });
      }
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
