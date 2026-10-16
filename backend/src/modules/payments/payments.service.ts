import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, count, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import { DomainEvent } from '../../common/events/domain-events';
import { UnitOfWork } from '../../common/events/unit-of-work';
import { Paginated } from '../../common/http/envelope';
import { IdempotencyService } from '../../common/http/idempotency.service';
import { Database, DbOrTx, DRIZZLE } from '../../database/database.module';
import {
  offerItems,
  orderItems,
  orders,
  paymentEvents,
  paymentReconciliationIssues,
  payments,
  requests,
  users,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  OrderStateMachineService,
  SYSTEM_ACTOR,
} from '../orders/order-state-machine.service';
import { EligibilityService } from '../requests/eligibility.service';
import { SettingsService } from '../settings/settings.service';
import {
  IPaymentProvider,
  PAYMENT_PROVIDER,
} from './providers/payment-provider';
import { ReceiptsService } from './receipts.service';

type PaymentRow = typeof payments.$inferSelect;

export const presentPayment = (p: PaymentRow, redirectUrl?: string | null) => ({
  payment_id: p.id,
  order_id: p.orderId,
  provider: p.provider,
  status: p.status,
  amount_centimes: p.amountCentimes,
  currency: p.currency,
  redirect_url: redirectUrl ?? null,
  verified_server_side_at: p.verifiedServerSideAt,
  failure_code: p.failureCode,
  expires_at: p.expiresAt,
  created_at: p.createdAt,
  updated_at: p.updatedAt,
});

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');
  private readonly baseUrl: string;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PAYMENT_PROVIDER) private readonly provider: IPaymentProvider,
    private readonly uow: UnitOfWork,
    private readonly sm: OrderStateMachineService,
    private readonly idempotency: IdempotencyService,
    private readonly eligibility: EligibilityService,
    private readonly settings: SettingsService,
    private readonly receipts: ReceiptsService,
    private readonly crypto: CryptoService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.baseUrl = config
      .get<string>('PUBLIC_BASE_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
  }

  get providerName() {
    return this.provider.name;
  }

  private async loadOrderForPatient(user: AuthUser, orderId: string) {
    const [o] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!o || o.patientUserId !== user.id)
      throw new AppException('ORDER_NOT_FOUND');
    return o;
  }

  // ------------------------------------------------------------- checkout

  /** Transparent breakdown shown before paying. */
  async checkout(user: AuthUser, orderId: string) {
    const o = await this.loadOrderForPatient(user, orderId);
    const lines = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, o.id));
    return {
      order_id: o.id,
      reference: o.reference,
      status: o.status,
      currency: o.currency,
      lines: lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unit_price_centimes: l.unitPriceCentimes,
        line_total_centimes: l.lineTotalCentimes,
      })),
      medicines_subtotal_centimes: o.itemsSubtotalCentimes,
      delivery_fee_centimes: o.deliveryFeeCentimes,
      service_fee_centimes: o.serviceFeeCentimes,
      total_centimes: o.totalCentimes,
      payable:
        o.status === 'AWAITING_PAYMENT' &&
        (!o.paymentDeadlineAt || o.paymentDeadlineAt > new Date()),
      payment_deadline_at: o.paymentDeadlineAt,
      payment_provider: this.provider.name,
      payment_collection_model: await this.settings.get(
        'payment_collection_model',
      ),
    };
  }

  // ------------------------------------------------------------------ pay

  /** Idempotency-Key is REQUIRED for this endpoint. */
  pay(
    user: AuthUser,
    orderId: string,
    idempotencyKey: string | undefined,
    meta: RequestMeta,
  ) {
    if (!idempotencyKey) throw new AppException('IDEMPOTENCY_KEY_INVALID');
    return this.idempotency.run(
      user.id,
      `order-pay:${orderId}`,
      idempotencyKey,
      { orderId },
      () => this.doPay(user, orderId, idempotencyKey, meta),
    );
  }

  private async doPay(
    user: AuthUser,
    orderId: string,
    idempotencyKey: string,
    meta: RequestMeta,
  ) {
    const o = await this.loadOrderForPatient(user, orderId);
    if (o.status === 'PAYMENT_PENDING')
      throw new AppException('PAYMENT_ALREADY_IN_PROGRESS');
    if (o.status !== 'AWAITING_PAYMENT')
      throw new AppException('PAYMENT_NOT_ALLOWED', { status: o.status });
    if (o.paymentDeadlineAt && o.paymentDeadlineAt <= new Date())
      throw new AppException('PAYMENT_DEADLINE_PASSED');

    // Online payment must be allowed for every category in the order.
    const [req] = await this.db
      .select({ type: requests.requestType })
      .from(requests)
      .where(eq(requests.id, o.requestId));
    const medicineIds = (
      await this.db
        .select({ m: offerItems.medicineId })
        .from(orderItems)
        .innerJoin(offerItems, eq(offerItems.id, orderItems.offerItemId))
        .where(eq(orderItems.orderId, o.id))
    )
      .map((r) => r.m)
      .filter((x): x is string => !!x);
    const categories = new Set<string>(
      (await this.eligibility.categoriesOf(medicineIds)).values(),
    );
    if (req?.type !== 'PRODUCT') categories.add('PRESCRIPTION');
    const policies = await this.eligibility.enabledPolicies([
      ...categories,
    ] as never);
    const blocked = [...categories].filter(
      (c) => !policies.get(c as never)?.allowedOnlinePayment,
    );
    if (blocked.length)
      throw new AppException('PAYMENT_NOT_ALLOWED_FOR_CATEGORY', {
        categories: blocked,
      });

    const collectionModel = await this.settings.get('payment_collection_model');
    // Amount ALWAYS from the server-side order.
    const payment = await this.uow
      .run(async (ctx) => {
        const [p] = await ctx.tx
          .insert(payments)
          .values({
            orderId: o.id,
            provider: this.provider.name,
            idempotencyKey: `${user.id}:${idempotencyKey}`,
            amountCentimes: o.totalCentimes,
            currency: 'DZD',
            status: 'INITIATED',
            initiatedByUserId: user.id,
            expiresAt: o.paymentDeadlineAt,
          })
          .returning();
        await this.sm.apply(ctx, o, 'PAYMENT_PENDING', SYSTEM_ACTOR, {
          metadata: { payment_id: p.id, initiated_by: 'PATIENT' },
        });
        await this.audit.log(
          {
            action: 'PAYMENT_INITIATED',
            actorUserId: user.id,
            actorRole: user.role,
            resourceType: 'payment',
            resourceId: p.id,
            ip: meta.ip,
            userAgent: meta.userAgent,
            metadata: {
              order_id: o.id,
              amount_centimes: o.totalCentimes,
              provider: this.provider.name,
            },
          },
          ctx.tx,
        );
        return p;
      })
      .catch((err: { code?: string }) => {
        // Concurrent double click: the order already left AWAITING_PAYMENT.
        if (
          err.code === 'ORDER_VERSION_CONFLICT' ||
          err.code === 'ORDER_INVALID_TRANSITION' ||
          err.code === '23505'
        ) {
          throw new AppException('PAYMENT_ALREADY_IN_PROGRESS');
        }
        throw err;
      });

    const [u] = await this.db
      .select({ lang: users.preferredLanguage })
      .from(users)
      .where(eq(users.id, user.id));
    try {
      const init = await this.provider.initiate({
        paymentId: payment.id,
        orderReference: o.reference,
        amountCentimes: payment.amountCentimes,
        currency: 'DZD',
        returnUrl: `${this.baseUrl}/payments/return/${payment.id}`,
        failUrl: `${this.baseUrl}/payments/return/${payment.id}`,
        language: (u?.lang as 'ar' | 'fr') ?? 'fr',
        collectionModel,
        pharmacyId: o.pharmacyId,
      });
      const [updated] = await this.db
        .update(payments)
        .set({
          status: 'PENDING',
          providerOrderId: init.providerOrderId,
          rawProviderResponseEncrypted: this.crypto.encrypt(
            JSON.stringify(init.raw),
          ),
        })
        .where(eq(payments.id, payment.id))
        .returning();
      return presentPayment(updated, init.redirectUrl);
    } catch (err) {
      this.logger.warn(
        `initiate failed for payment ${payment.id}: ${(err as Error).message}`,
      );
      await this.failPayment(payment, 'PROVIDER_UNAVAILABLE');
      throw new AppException('PAYMENT_PROVIDER_ERROR');
    }
  }

  /** Marks a payment failed and puts the order back to AWAITING_PAYMENT (deadline permitting). */
  private async failPayment(payment: PaymentRow, failureCode: string) {
    await this.uow.run(async (ctx) => {
      const done = await ctx.tx
        .update(payments)
        .set({ status: 'FAILED', failureCode })
        .where(
          and(
            eq(payments.id, payment.id),
            inArray(payments.status, ['INITIATED', 'PENDING']),
          ),
        )
        .returning({ id: payments.id });
      if (!done.length) return;
      const [o] = await ctx.tx
        .select()
        .from(orders)
        .where(eq(orders.id, payment.orderId))
        .limit(1);
      if (o?.status === 'PAYMENT_PENDING') {
        const expired =
          o.paymentDeadlineAt && o.paymentDeadlineAt <= new Date();
        await this.sm.apply(
          ctx,
          o,
          expired ? 'CANCELLED' : 'AWAITING_PAYMENT',
          SYSTEM_ACTOR,
          {
            reason: expired
              ? 'payment_failed_after_deadline'
              : `payment_failed:${failureCode}`,
            metadata: { payment_id: payment.id },
            ...(expired
              ? {
                  set: {
                    cancelReason: 'payment_failed_after_deadline',
                    cancelledAt: new Date(),
                  },
                }
              : {}),
          },
        );
      }
      ctx.emit(DomainEvent.PAYMENT_FAILED, {
        paymentId: payment.id,
        orderId: payment.orderId,
      });
    });
  }

  // ------------------------------------------------- server-side verification

  /**
   * The ONLY way a payment becomes CONFIRMED: ask the provider (server to
   * server), compare the amount with the order, then move the order.
   * Idempotent – safe to call from webhooks, return URLs, polling and jobs.
   */
  async verifyAndApply(paymentId: string): Promise<PaymentRow> {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);
    if (!payment) throw new AppException('PAYMENT_NOT_FOUND');
    if (payment.status !== 'PENDING' || !payment.providerOrderId)
      return payment;

    const status = await this.provider.getStatus(payment.providerOrderId);
    if (status.status === 'PENDING') return payment;
    if (status.status === 'FAILED' || status.status === 'CANCELLED') {
      await this.failPayment(
        payment,
        status.status === 'CANCELLED' ? 'CANCELLED_BY_USER' : 'DECLINED',
      );
      return (
        await this.db.select().from(payments).where(eq(payments.id, paymentId))
      )[0];
    }

    if (status.amountCentimes !== payment.amountCentimes) {
      // Never confirm a payment whose captured amount differs from the order.
      await this.openIssue('AMOUNT_MISMATCH', payment, {
        expected: payment.amountCentimes,
        captured: status.amountCentimes,
      });
      await this.db
        .update(payments)
        .set({ failureCode: 'AMOUNT_MISMATCH' })
        .where(eq(payments.id, payment.id));
      return (
        await this.db.select().from(payments).where(eq(payments.id, paymentId))
      )[0];
    }

    await this.uow.run(async (ctx) => {
      const confirmed = await ctx.tx
        .update(payments)
        .set({
          status: 'CONFIRMED',
          verifiedServerSideAt: new Date(),
          providerReference: status.providerReference ?? null,
          rawProviderResponseEncrypted: this.crypto.encrypt(
            JSON.stringify(status.raw),
          ),
          failureCode: null,
        })
        .where(and(eq(payments.id, payment.id), eq(payments.status, 'PENDING')))
        .returning();
      if (!confirmed.length) return;
      const [o] = await ctx.tx
        .select()
        .from(orders)
        .where(eq(orders.id, payment.orderId))
        .limit(1);
      if (o.status !== 'PAYMENT_PENDING') {
        // Paid while the order is no longer payable (e.g. cancelled by timeout) → must be refunded.
        await this.openIssue(
          'PAID_ORDER_NOT_PAYABLE',
          confirmed[0],
          { order_status: o.status },
          ctx.tx,
        );
        return;
      }
      const after = await this.sm.apply(
        ctx,
        o,
        'PAYMENT_CONFIRMED',
        SYSTEM_ACTOR,
        { metadata: { payment_id: payment.id } },
      );
      if (after.workflowVariant === 'PAYMENT_FIRST') {
        await this.sm.apply(
          ctx,
          after,
          'PHARMACIST_VALIDATION_PENDING',
          SYSTEM_ACTOR,
        );
      }
      await this.receipts.issue(ctx.tx, after, confirmed[0]);
      ctx.emit(DomainEvent.PAYMENT_CONFIRMED, {
        paymentId: payment.id,
        orderId: o.id,
        patientUserId: o.patientUserId,
        reference: o.reference,
      });
    });
    return (
      await this.db.select().from(payments).where(eq(payments.id, paymentId))
    )[0];
  }

  async statusForPatient(user: AuthUser, paymentId: string) {
    const [p] = await this.db
      .select({ p: payments, patient: orders.patientUserId })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(eq(payments.id, paymentId))
      .limit(1);
    if (!p || p.patient !== user.id)
      throw new AppException('PAYMENT_NOT_FOUND');
    // Polling triggers a server-side check – the frontend never confirms a payment.
    return presentPayment(await this.verifyAndApply(paymentId));
  }

  /** Browser return from the hosted page: informational only, verifies server-side. */
  async handleReturn(paymentId: string) {
    const p = await this.verifyAndApply(paymentId).catch(() => null);
    return p
      ? { payment_id: p.id, order_id: p.orderId, status: p.status }
      : { payment_id: paymentId, status: 'UNKNOWN' };
  }

  // -------------------------------------------------------------- webhooks

  /**
   * Stores EVERY event before processing (signature result included); the
   * unique provider_event_id gives replay protection; processing is
   * idempotent and relies on the provider status, not on the webhook body.
   */
  async webhook(
    providerName: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
  ) {
    const expected = this.provider.name === 'MOCK' ? 'mock' : 'edahabia';
    if (providerName.toLowerCase() !== expected)
      throw new AppException('PAYMENT_PROVIDER_UNKNOWN');
    const check = this.provider.verifyWebhook(
      headers,
      rawBody ?? Buffer.alloc(0),
    );
    const eventId = check.eventId ?? `unidentified:${randomUUID()}`;

    const [payment] = check.providerOrderId
      ? await this.db
          .select()
          .from(payments)
          .where(eq(payments.providerOrderId, check.providerOrderId))
          .limit(1)
      : [];
    const inserted = await this.db
      .insert(paymentEvents)
      .values({
        paymentId: payment?.id ?? null,
        providerEventId: `${expected}:${eventId}`,
        eventType: check.eventType.slice(0, 64),
        payload: check.payload as object,
        signatureValid: check.signatureValid,
      })
      .onConflictDoNothing({ target: paymentEvents.providerEventId })
      .returning({ id: paymentEvents.id });

    if (!inserted.length) return { received: true, duplicate: true };
    if (!check.signatureValid) {
      await this.db
        .update(paymentEvents)
        .set({
          processedAt: new Date(),
          processingResult: 'rejected:invalid_signature',
        })
        .where(eq(paymentEvents.id, inserted[0].id));
      await this.audit.log({
        action: 'PAYMENT_WEBHOOK_REJECTED',
        resourceType: 'payment_event',
        resourceId: inserted[0].id,
        metadata: { reason: 'invalid_signature' },
      });
      throw new AppException('PAYMENT_WEBHOOK_INVALID_SIGNATURE');
    }
    let result = 'ignored:unknown_payment';
    if (payment) {
      const after = await this.verifyAndApply(payment.id);
      result = `verified:${after.status}`;
    } else {
      await this.openIssue('ORPHAN_EVENT', null, {
        provider_order_id: check.providerOrderId,
        event_id: eventId,
      });
    }
    await this.db
      .update(paymentEvents)
      .set({ processedAt: new Date(), processingResult: result })
      .where(eq(paymentEvents.id, inserted[0].id));
    return { received: true, duplicate: false, result };
  }

  // -------------------------------------------------------- reconciliation

  async openIssue(
    kind: string,
    payment: PaymentRow | null,
    details: Record<string, unknown>,
    tx: DbOrTx = this.db,
  ) {
    const [existing] = await this.db
      .select({ id: paymentReconciliationIssues.id })
      .from(paymentReconciliationIssues)
      .where(
        and(
          eq(paymentReconciliationIssues.kind, kind),
          eq(paymentReconciliationIssues.status, 'OPEN'),
          payment
            ? eq(paymentReconciliationIssues.paymentId, payment.id)
            : sql`${paymentReconciliationIssues.paymentId} IS NULL AND ${paymentReconciliationIssues.details}->>'provider_order_id' = ${String(details.provider_order_id ?? '')}`,
        ),
      )
      .limit(1);
    if (existing) return existing.id;
    const [row] = await tx
      .insert(paymentReconciliationIssues)
      .values({
        kind,
        paymentId: payment?.id ?? null,
        orderId: payment?.orderId ?? null,
        details,
        status: 'OPEN',
      })
      .returning({ id: paymentReconciliationIssues.id });
    this.logger.warn(
      `reconciliation issue ${kind} (payment ${payment?.id ?? '-'})`,
    );
    return row.id;
  }

  /**
   * Re-checks PENDING payments with the provider and detects anomalies:
   * duplicates (two confirmed payments for one order), stale pending
   * payments, paid orders without a confirmed payment.
   */
  async reconcile(now = new Date()) {
    const pending = await this.db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.status, 'PENDING'),
          lt(payments.updatedAt, new Date(now.getTime() - 60_000)),
        ),
      )
      .limit(200);
    for (const p of pending) {
      try {
        const after = await this.verifyAndApply(p.id);
        if (
          after.status === 'PENDING' &&
          p.createdAt < new Date(now.getTime() - 24 * 3_600_000)
        ) {
          await this.openIssue('STALE_PENDING', p, { created_at: p.createdAt });
        }
      } catch (err) {
        this.logger.warn(`reconcile ${p.id}: ${(err as Error).message}`);
      }
    }
    const duplicates = await this.db
      .select({ orderId: payments.orderId, n: count() })
      .from(payments)
      .where(eq(payments.status, 'CONFIRMED'))
      .groupBy(payments.orderId)
      .having(sql`count(*) > 1`);
    for (const d of duplicates) {
      const [p] = await this.db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.orderId, d.orderId),
            eq(payments.status, 'CONFIRMED'),
          ),
        )
        .orderBy(desc(payments.createdAt))
        .limit(1);
      await this.openIssue('DUPLICATE_PAYMENT', p, {
        confirmed_payments: Number(d.n),
      });
    }
    const unpaid = await this.db.execute<{ id: string }>(
      sql`SELECT o.id FROM orders o WHERE o.status IN ('PAYMENT_CONFIRMED','PREPARING','READY_FOR_PICKUP') AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.status IN ('CONFIRMED','REFUND_PENDING','REFUNDED')) LIMIT 100`,
    );
    for (const o of unpaid.rows) {
      const [existing] = await this.db
        .select({ id: paymentReconciliationIssues.id })
        .from(paymentReconciliationIssues)
        .where(
          and(
            eq(paymentReconciliationIssues.orderId, o.id),
            eq(paymentReconciliationIssues.kind, 'MISSING_PAYMENT'),
            eq(paymentReconciliationIssues.status, 'OPEN'),
          ),
        )
        .limit(1);
      if (!existing)
        await this.db.insert(paymentReconciliationIssues).values({
          kind: 'MISSING_PAYMENT',
          orderId: o.id,
          details: {},
          status: 'OPEN',
        });
    }
    return {
      checked: pending.length,
      duplicates: duplicates.length,
      missing: unpaid.rows.length,
    };
  }

  async listIssues(q: {
    page: number;
    limit: number;
    offset: number;
    order: 'asc' | 'desc';
    status?: string;
    kind?: string;
  }) {
    const conditions = [];
    if (q.status)
      conditions.push(eq(paymentReconciliationIssues.status, q.status));
    if (q.kind) conditions.push(eq(paymentReconciliationIssues.kind, q.kind));
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(paymentReconciliationIssues)
        .where(where)
        .orderBy(
          q.order === 'asc'
            ? paymentReconciliationIssues.createdAt
            : desc(paymentReconciliationIssues.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db
        .select({ total: count() })
        .from(paymentReconciliationIssues)
        .where(where),
    ]);
    return Paginated.of(
      rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        payment_id: r.paymentId,
        order_id: r.orderId,
        details: r.details,
        resolution_note: r.resolutionNote,
        resolved_by: r.resolvedBy,
        resolved_at: r.resolvedAt,
        created_at: r.createdAt,
      })),
      total,
      q.page,
      q.limit,
    );
  }

  async resolveIssue(
    actor: AuthUser,
    id: string,
    note: string,
    meta: RequestMeta,
  ) {
    const [row] = await this.db
      .update(paymentReconciliationIssues)
      .set({
        status: 'RESOLVED',
        resolutionNote: note,
        resolvedBy: actor.id,
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(paymentReconciliationIssues.id, id),
          eq(paymentReconciliationIssues.status, 'OPEN'),
        ),
      )
      .returning();
    if (!row) throw new AppException('RECONCILIATION_ISSUE_NOT_FOUND');
    await this.audit.log({
      action: 'RECONCILIATION_ISSUE_RESOLVED',
      actorUserId: actor.id,
      actorRole: actor.role,
      resourceType: 'reconciliation_issue',
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      reason: note,
    });
    return { id: row.id, status: row.status, resolved_at: row.resolvedAt };
  }

  /** Payments of an order visible to its patient. */
  async listForOrder(user: AuthUser, orderId: string) {
    await this.loadOrderForPatient(user, orderId);
    const rows = await this.db
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .orderBy(desc(payments.createdAt));
    return rows.map((p) => presentPayment(p));
  }

  /** Notifies the patient once a payment is confirmed / fails. */
  async notifyPatient(
    type: 'PAYMENT_CONFIRMED' | 'PAYMENT_FAILED',
    orderId: string,
  ) {
    const [o] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!o) return;
    await this.notifications.notify({
      userIds: [o.patientUserId],
      type,
      params: { reference: o.reference },
      data: { order_id: o.id },
    });
  }
}
