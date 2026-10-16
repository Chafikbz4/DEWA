import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, lt, sql, SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  chifaSubmissions,
  conversations,
  deliveries,
  messages,
  offers,
  orderItems,
  orderStatusHistory,
  orders,
  payments,
  pharmacies,
  refunds,
  requestFiles,
  requestItems,
  requestRecipients,
  requests,
} from '../../database/schema';
import { SensitiveAccessService } from '../audit/sensitive-access.service';
import { LOG_TYPE, SensitiveGrantsService } from './sensitive-grants.service';

export interface MonitoringQuery {
  page: number;
  limit: number;
  offset: number;
  order: 'asc' | 'desc';
  status?: string;
  pharmacy_id?: string;
  wilaya_id?: number;
  from?: string;
  to?: string;
}

const area = (snap: unknown) => {
  const a = (snap ?? null) as Record<string, unknown> | null;
  return a
    ? {
        wilaya_id: a.wilaya_id ?? null,
        commune_id: a.commune_id ?? null,
        commune_name_fr: a.commune_name_fr ?? null,
      }
    : null;
};

/**
 * Admin monitoring of requests / orders: METADATA ONLY (statuses, amounts,
 * counts, timestamps). Prescription items, files, Chifa data and messages
 * need an active sensitive-access grant.
 */
@Injectable()
export class MonitoringService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly grants: SensitiveGrantsService,
    private readonly sensitive: SensitiveAccessService,
    private readonly crypto: CryptoService,
  ) {}

  private period(
    col: typeof requests.createdAt | typeof orders.createdAt,
    q: MonitoringQuery,
  ): SQL[] {
    const c: SQL[] = [];
    if (q.from) c.push(gte(col, new Date(`${q.from.slice(0, 10)}T00:00:00Z`)));
    if (q.to)
      c.push(
        lt(
          col,
          new Date(
            new Date(`${q.to.slice(0, 10)}T00:00:00Z`).getTime() + 86_400_000,
          ),
        ),
      );
    return c;
  }

  // ------------------------------------------------------------ requests

  async listRequests(q: MonitoringQuery) {
    const c = this.period(requests.createdAt, q);
    if (q.status) c.push(eq(requests.status, q.status as never));
    if (q.wilaya_id)
      c.push(
        sql`(${requests.deliveryAddressSnapshot}->>'wilaya_id')::int = ${q.wilaya_id}`,
      );
    if (q.pharmacy_id)
      c.push(
        sql`EXISTS (SELECT 1 FROM request_recipients rr WHERE rr.request_id = "requests"."id" AND rr.pharmacy_id = ${q.pharmacy_id})`,
      );
    const where = c.length ? and(...c) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          r: requests,
          recipients: sql<number>`(SELECT count(*)::int FROM request_recipients x WHERE x.request_id = "requests"."id")`,
          offers: sql<number>`(SELECT count(*)::int FROM offers x WHERE x.request_id = "requests"."id" AND x.status <> 'DRAFT')`,
          files: sql<number>`(SELECT count(*)::int FROM request_files x WHERE x.request_id = "requests"."id")`,
        })
        .from(requests)
        .where(where)
        .orderBy(
          q.order === 'asc'
            ? asc(requests.createdAt)
            : desc(requests.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(requests).where(where),
    ]);
    return Paginated.of(
      rows.map(({ r, ...n }) => ({
        id: r.id,
        reference: r.reference,
        request_type: r.requestType,
        status: r.status,
        urgency: r.urgency,
        patient_user_id: r.patientUserId,
        for_dependant: !!r.dependantId,
        delivery_wanted: r.deliveryWanted,
        area: area(r.deliveryAddressSnapshot),
        recipients_count: n.recipients,
        offers_count: n.offers,
        files_count: n.files,
        created_at: r.createdAt,
        expires_at: r.expiresAt,
        cancelled_at: r.cancelledAt,
      })),
      total,
      q.page,
      q.limit,
    );
  }

  async getRequest(id: string) {
    const [r] = await this.db
      .select()
      .from(requests)
      .where(eq(requests.id, id))
      .limit(1);
    if (!r) throw new AppException('NOT_FOUND');
    const recipients = await this.db
      .select({ rr: requestRecipients, name: pharmacies.nameFr })
      .from(requestRecipients)
      .innerJoin(pharmacies, eq(pharmacies.id, requestRecipients.pharmacyId))
      .where(eq(requestRecipients.requestId, id));
    const offerRows = await this.db
      .select()
      .from(offers)
      .where(eq(offers.requestId, id))
      .orderBy(asc(offers.createdAt));
    const [{ files }] = await this.db
      .select({ files: count() })
      .from(requestFiles)
      .where(eq(requestFiles.requestId, id));
    const [{ items }] = await this.db
      .select({ items: count() })
      .from(requestItems)
      .where(eq(requestItems.requestId, id));
    return {
      id: r.id,
      reference: r.reference,
      request_type: r.requestType,
      status: r.status,
      urgency: r.urgency,
      patient_user_id: r.patientUserId,
      for_dependant: !!r.dependantId,
      delivery_wanted: r.deliveryWanted,
      area: area(r.deliveryAddressSnapshot),
      files_count: files,
      items_count: items,
      cancel_reason: r.cancelReason,
      created_at: r.createdAt,
      expires_at: r.expiresAt,
      recipients: recipients.map(({ rr, name }) => ({
        pharmacy_id: rr.pharmacyId,
        pharmacy_name: name,
        status: rr.status,
        sent_at: rr.sentAt,
        viewed_at: rr.viewedAt,
        responded_at: rr.respondedAt,
      })),
      offers: offerRows.map((o) => ({
        id: o.id,
        pharmacy_id: o.pharmacyId,
        status: o.status,
        total_centimes: o.totalCentimes,
        sent_at: o.sentAt,
      })),
      sensitive_content:
        'POST /admin/sensitive-access { resource_type: "REQUEST", resource_id } then GET /admin/requests/:id/content',
    };
  }

  /** Prescription items, files and Chifa data – requires an active REQUEST grant; the read itself is logged. */
  async requestContent(admin: AuthUser, id: string, meta: RequestMeta) {
    const grant = await this.grants.assertActive(admin, 'REQUEST', id);
    const [r] = await this.db
      .select()
      .from(requests)
      .where(eq(requests.id, id))
      .limit(1);
    if (!r) throw new AppException('NOT_FOUND');
    const items = await this.db
      .select()
      .from(requestItems)
      .where(eq(requestItems.requestId, id));
    const files = await this.db
      .select()
      .from(requestFiles)
      .where(eq(requestFiles.requestId, id))
      .orderBy(asc(requestFiles.pageOrder));
    const [chifa] = await this.db
      .select()
      .from(chifaSubmissions)
      .where(eq(chifaSubmissions.requestId, id))
      .limit(1);
    await this.sensitive.record(admin, LOG_TYPE.REQUEST, id, {
      justification: grant.justification,
      ip: meta.ip,
      userAgent: meta.userAgent,
      detail: `grant:${grant.id}:content`,
    });
    return {
      request_id: r.id,
      reference: r.reference,
      patient_note: r.patientNote,
      items: items.map((i) => ({
        id: i.id,
        raw_name: i.rawName,
        quantity: i.quantity,
        dosage_text: i.dosageText,
        source: i.source,
      })),
      files: files.map((f) => ({ file_id: f.fileId, page_order: f.pageOrder })),
      chifa: chifa
        ? {
            card_file_id: chifa.cardFileId,
            holder_name: chifa.holderName,
            insurance_number_masked: chifa.insuranceNumberEncrypted
              ? CryptoService.mask(
                  this.crypto.decrypt(chifa.insuranceNumberEncrypted),
                )
              : null,
            verification_status: chifa.verificationStatus,
          }
        : null,
      grant_expires_at: grant.expiresAt,
      files_access:
        'POST /files/:file_id/access-url (allowed while the grant is active; each URL is logged)',
    };
  }

  // -------------------------------------------------------------- orders

  async listOrders(q: MonitoringQuery) {
    const c = this.period(orders.createdAt, q);
    if (q.status) c.push(eq(orders.status, q.status as never));
    if (q.pharmacy_id) c.push(eq(orders.pharmacyId, q.pharmacy_id));
    if (q.wilaya_id)
      c.push(
        sql`EXISTS (SELECT 1 FROM pharmacies p WHERE p.id = "orders"."pharmacy_id" AND p.wilaya_id = ${q.wilaya_id})`,
      );
    const where = c.length ? and(...c) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(orders)
        .where(where)
        .orderBy(
          q.order === 'asc' ? asc(orders.createdAt) : desc(orders.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(orders).where(where),
    ]);
    return Paginated.of(
      rows.map((o) => this.presentOrder(o)),
      total,
      q.page,
      q.limit,
    );
  }

  private presentOrder(o: typeof orders.$inferSelect) {
    return {
      id: o.id,
      reference: o.reference,
      status: o.status,
      workflow_variant: o.workflowVariant,
      fulfillment_type: o.fulfillmentType,
      patient_user_id: o.patientUserId,
      pharmacy_id: o.pharmacyId,
      request_id: o.requestId,
      items_subtotal_centimes: o.itemsSubtotalCentimes,
      delivery_fee_centimes: o.deliveryFeeCentimes,
      service_fee_centimes: o.serviceFeeCentimes,
      total_centimes: o.totalCentimes,
      status_changed_at: o.statusChangedAt,
      created_at: o.createdAt,
    };
  }

  /** Order metadata, history, payments, refunds, delivery – no item names. */
  async getOrder(id: string) {
    const [o] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);
    if (!o) throw new AppException('ORDER_NOT_FOUND');
    const [history, pays, refs, [delivery]] = await Promise.all([
      this.db
        .select()
        .from(orderStatusHistory)
        .where(eq(orderStatusHistory.orderId, id))
        .orderBy(asc(orderStatusHistory.createdAt)),
      this.db
        .select()
        .from(payments)
        .where(eq(payments.orderId, id))
        .orderBy(asc(payments.createdAt)),
      this.db
        .select()
        .from(refunds)
        .where(eq(refunds.orderId, id))
        .orderBy(asc(refunds.createdAt)),
      this.db
        .select()
        .from(deliveries)
        .where(eq(deliveries.orderId, id))
        .limit(1),
    ]);
    const [{ items }] = await this.db
      .select({ items: count() })
      .from(orderItems)
      .where(eq(orderItems.orderId, id));
    return {
      ...this.presentOrder(o),
      items_count: items,
      cancel_reason: o.cancelReason,
      history: history.map((h) => ({
        from: h.fromStatus,
        to: h.toStatus,
        actor_role: h.actorRole,
        reason: h.reason,
        at: h.createdAt,
      })),
      payments: pays.map((p) => ({
        id: p.id,
        provider: p.provider,
        status: p.status,
        amount_centimes: p.amountCentimes,
        verified_server_side_at: p.verifiedServerSideAt,
        failure_code: p.failureCode,
        created_at: p.createdAt,
      })),
      refunds: refs.map((r) => ({
        id: r.id,
        status: r.status,
        amount_centimes: r.amountCentimes,
        reason: r.reason,
        created_at: r.createdAt,
      })),
      delivery: delivery
        ? {
            id: delivery.id,
            status: delivery.status,
            driver_id: delivery.driverId,
            package_label: delivery.packageLabel,
            delivered_at: delivery.deliveredAt,
            failure_reason: delivery.failureReason,
          }
        : null,
    };
  }

  // -------------------------------------------------------- conversations

  async conversationMessages(
    admin: AuthUser,
    id: string,
    q: { page: number; limit: number; offset: number },
    meta: RequestMeta,
  ) {
    const grant = await this.grants.assertActive(admin, 'CONVERSATION', id);
    const [c] = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);
    if (!c) throw new AppException('NOT_FOUND');
    const where = eq(messages.conversationId, id);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(messages)
        .where(where)
        .orderBy(asc(messages.createdAt))
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(messages).where(where),
    ]);
    await this.sensitive.record(admin, LOG_TYPE.CONVERSATION, id, {
      justification: grant.justification,
      ip: meta.ip,
      userAgent: meta.userAgent,
      detail: `grant:${grant.id}:messages`,
    });
    return Paginated.of(
      rows.map((m) => ({
        id: m.id,
        sender_user_id: m.senderUserId,
        message_type: m.messageType,
        body: m.body,
        file_id: m.fileId,
        created_at: m.createdAt,
      })),
      total,
      q.page,
      q.limit,
    );
  }
}
