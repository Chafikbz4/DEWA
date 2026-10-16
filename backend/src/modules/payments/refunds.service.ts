import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { and, count, desc, eq, inArray, ne, sql, SQL } from 'drizzle-orm';
import { AuthUser, PharmacyContext } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { DomainEvent } from '../../common/events/domain-events';
import { TxContext, UnitOfWork } from '../../common/events/unit-of-work';
import { Paginated } from '../../common/http/envelope';
import { Database, DbOrTx, DRIZZLE } from '../../database/database.module';
import { orders, payments, refunds } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  OrderStateMachineService,
  SYSTEM_ACTOR,
} from '../orders/order-state-machine.service';
import {
  IPaymentProvider,
  PAYMENT_PROVIDER,
} from './providers/payment-provider';

type RefundRow = typeof refunds.$inferSelect;
type OrderRow = typeof orders.$inferSelect;

export const presentRefund = (r: RefundRow) => ({
  id: r.id,
  order_id: r.orderId,
  payment_id: r.paymentId,
  amount_centimes: r.amountCentimes,
  reason: r.reason,
  status: r.status,
  requested_by: r.requestedBy,
  approved_by_admin_id: r.approvedByAdminId,
  provider_refund_reference: r.providerRefundReference,
  created_at: r.createdAt,
  completed_at: r.completedAt,
});

/**
 * Refund lifecycle: REQUESTED → APPROVED → PROCESSING → COMPLETED (or REJECTED).
 * Full refunds are created automatically when an order enters REFUND_PENDING;
 * partial refunds (e.g. an item unavailable after payment) are requested by
 * the patient or the pharmacy. An admin approves; the provider is then called.
 */
@Injectable()
export class RefundsService implements OnModuleInit {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PAYMENT_PROVIDER) private readonly provider: IPaymentProvider,
    private readonly uow: UnitOfWork,
    private readonly sm: OrderStateMachineService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.sm.onEnter('REFUND_PENDING', (ctx, order) =>
      this.onRefundPending(ctx, order),
    );
  }

  private async confirmedPayment(tx: DbOrTx, orderId: string) {
    const [p] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.orderId, orderId),
          inArray(payments.status, ['CONFIRMED', 'REFUND_PENDING']),
        ),
      )
      .orderBy(desc(payments.createdAt))
      .limit(1);
    return p;
  }

  /** Paid amount minus every refund not rejected. */
  private async refundable(tx: DbOrTx, paymentId: string, paid: number) {
    const [{ used }] = await tx
      .select({
        used: sql<number>`coalesce(sum(${refunds.amountCentimes}), 0)::bigint`,
      })
      .from(refunds)
      .where(
        and(eq(refunds.paymentId, paymentId), ne(refunds.status, 'REJECTED')),
      );
    return paid - Number(used);
  }

  /** Order cancelled after capture → full refund request (or straight to REFUNDED if nothing was paid). */
  private async onRefundPending(ctx: TxContext, order: OrderRow) {
    const payment = await this.confirmedPayment(ctx.tx, order.id);
    if (!payment) {
      await this.sm.apply(ctx, order, 'REFUNDED', SYSTEM_ACTOR, {
        reason: 'nothing_captured',
      });
      return;
    }
    const amount = await this.refundable(
      ctx.tx,
      payment.id,
      payment.amountCentimes,
    );
    if (amount <= 0) return;
    await ctx.tx.insert(refunds).values({
      paymentId: payment.id,
      orderId: order.id,
      amountCentimes: amount,
      reason: order.cancelReason ?? 'order_refund_pending',
      status: 'REQUESTED',
      requestedBy: order.cancelledByUserId,
    });
    await ctx.tx
      .update(payments)
      .set({ status: 'REFUND_PENDING' })
      .where(eq(payments.id, payment.id));
  }

  // ----------------------------------------------------------- requests

  private async createRequest(
    order: OrderRow,
    requestedBy: AuthUser,
    amount: number | undefined,
    reason: string,
    meta: RequestMeta,
  ) {
    return this.uow.run(async (ctx) => {
      const payment = await this.confirmedPayment(ctx.tx, order.id);
      if (!payment)
        throw new AppException('REFUND_NOT_ALLOWED', {
          reason: 'no_confirmed_payment',
        });
      const refundable = await this.refundable(
        ctx.tx,
        payment.id,
        payment.amountCentimes,
      );
      const value = amount ?? refundable;
      if (value <= 0 || value > refundable)
        throw new AppException('REFUND_AMOUNT_INVALID', {
          refundable_centimes: refundable,
        });
      const [r] = await ctx.tx
        .insert(refunds)
        .values({
          paymentId: payment.id,
          orderId: order.id,
          amountCentimes: value,
          reason,
          status: 'REQUESTED',
          requestedBy: requestedBy.id,
        })
        .returning();
      await this.audit.log(
        {
          action: 'REFUND_REQUESTED',
          actorUserId: requestedBy.id,
          actorRole: requestedBy.role,
          resourceType: 'refund',
          resourceId: r.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: { order_id: order.id, amount_centimes: value },
        },
        ctx.tx,
      );
      return presentRefund(r);
    });
  }

  async requestByPatient(
    user: AuthUser,
    orderId: string,
    dto: { amount_centimes?: number; reason: string },
    meta: RequestMeta,
  ) {
    const [o] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!o || o.patientUserId !== user.id)
      throw new AppException('ORDER_NOT_FOUND');
    return this.createRequest(o, user, dto.amount_centimes, dto.reason, meta);
  }

  async requestByPharmacy(
    user: AuthUser,
    ph: PharmacyContext,
    orderId: string,
    dto: { amount_centimes?: number; reason: string },
    meta: RequestMeta,
  ) {
    const [o] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!o || o.pharmacyId !== ph.id) throw new AppException('ORDER_NOT_FOUND');
    return this.createRequest(o, user, dto.amount_centimes, dto.reason, meta);
  }

  async listForOrder(user: AuthUser, orderId: string) {
    const [o] = await this.db
      .select({ patient: orders.patientUserId })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!o || o.patient !== user.id) throw new AppException('ORDER_NOT_FOUND');
    const rows = await this.db
      .select()
      .from(refunds)
      .where(eq(refunds.orderId, orderId))
      .orderBy(desc(refunds.createdAt));
    return rows.map(presentRefund);
  }

  // -------------------------------------------------------------- admin

  async queue(q: {
    page: number;
    limit: number;
    offset: number;
    order: 'asc' | 'desc';
    status?: string[];
  }) {
    const where: SQL | undefined = q.status?.length
      ? inArray(refunds.status, q.status as RefundRow['status'][])
      : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(refunds)
        .where(where)
        .orderBy(
          q.order === 'asc' ? refunds.createdAt : desc(refunds.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(refunds).where(where),
    ]);
    return Paginated.of(rows.map(presentRefund), total, q.page, q.limit);
  }

  /** Approve + execute with the provider. */
  async approve(admin: AuthUser, refundId: string, meta: RequestMeta) {
    const [claimed] = await this.db
      .update(refunds)
      .set({ status: 'PROCESSING', approvedByAdminId: admin.id })
      .where(
        and(
          eq(refunds.id, refundId),
          inArray(refunds.status, ['REQUESTED', 'APPROVED']),
        ),
      )
      .returning();
    if (!claimed)
      throw new AppException('REFUND_NOT_ALLOWED', { reason: 'not_requested' });
    await this.audit.log({
      action: 'REFUND_APPROVED',
      actorUserId: admin.id,
      actorRole: admin.role,
      resourceType: 'refund',
      resourceId: refundId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { amount_centimes: claimed.amountCentimes },
    });
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.id, claimed.paymentId));
    let result;
    try {
      result = await this.provider.refund({
        providerOrderId: payment.providerOrderId ?? '',
        amountCentimes: claimed.amountCentimes,
        refundId,
      });
    } catch {
      result = {
        status: 'FAILED' as const,
        providerRefundReference: null,
        raw: null,
      };
    }
    if (result.status === 'FAILED') {
      await this.db
        .update(refunds)
        .set({ status: 'APPROVED' })
        .where(eq(refunds.id, refundId));
      throw new AppException('PAYMENT_PROVIDER_ERROR');
    }
    if (result.status === 'PENDING') {
      await this.db
        .update(refunds)
        .set({ providerRefundReference: result.providerRefundReference })
        .where(eq(refunds.id, refundId));
      return presentRefund(
        (
          await this.db.select().from(refunds).where(eq(refunds.id, refundId))
        )[0],
      );
    }
    return this.complete(refundId, result.providerRefundReference);
  }

  /** COMPLETED → payment REFUNDED once fully refunded → order REFUNDED if waiting for it. */
  async complete(refundId: string, providerReference: string | null) {
    return this.uow.run(async (ctx) => {
      const [r] = await ctx.tx
        .update(refunds)
        .set({
          status: 'COMPLETED',
          completedAt: new Date(),
          providerRefundReference: providerReference,
        })
        .where(and(eq(refunds.id, refundId), eq(refunds.status, 'PROCESSING')))
        .returning();
      if (!r) throw new AppException('REFUND_NOT_ALLOWED');
      const [payment] = await ctx.tx
        .select()
        .from(payments)
        .where(eq(payments.id, r.paymentId));
      const [{ done }] = await ctx.tx
        .select({
          done: sql<number>`coalesce(sum(${refunds.amountCentimes}), 0)::bigint`,
        })
        .from(refunds)
        .where(
          and(
            eq(refunds.paymentId, payment.id),
            eq(refunds.status, 'COMPLETED'),
          ),
        );
      const fully = Number(done) >= payment.amountCentimes;
      await ctx.tx
        .update(payments)
        .set({
          status: fully
            ? 'REFUNDED'
            : payment.status === 'REFUND_PENDING'
              ? 'REFUND_PENDING'
              : 'CONFIRMED',
        })
        .where(eq(payments.id, payment.id));
      const [o] = await ctx.tx
        .select()
        .from(orders)
        .where(eq(orders.id, r.orderId));
      if (fully && o.status === 'REFUND_PENDING') {
        await this.sm.apply(ctx, o, 'REFUNDED', SYSTEM_ACTOR, {
          metadata: { refund_id: r.id },
        });
      }
      ctx.emit(DomainEvent.REFUND_COMPLETED, {
        refundId: r.id,
        orderId: o.id,
        patientUserId: o.patientUserId,
        reference: o.reference,
      });
      return presentRefund(r);
    });
  }

  async reject(
    admin: AuthUser,
    refundId: string,
    reason: string,
    meta: RequestMeta,
  ) {
    const [r] = await this.db
      .update(refunds)
      .set({
        status: 'REJECTED',
        approvedByAdminId: admin.id,
        reason: sql`${refunds.reason} || ' | rejected: ' || ${reason}`,
      })
      .where(
        and(
          eq(refunds.id, refundId),
          inArray(refunds.status, ['REQUESTED', 'APPROVED']),
        ),
      )
      .returning();
    if (!r) throw new AppException('REFUND_NOT_ALLOWED');
    await this.audit.log({
      action: 'REFUND_REJECTED',
      actorUserId: admin.id,
      actorRole: admin.role,
      resourceType: 'refund',
      resourceId: refundId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      reason,
    });
    return presentRefund(r);
  }

  async notifyCompleted(e: {
    orderId: string;
    patientUserId: string;
    reference: string;
  }) {
    await this.notifications.notify({
      userIds: [e.patientUserId],
      type: 'REFUND_COMPLETED',
      params: { reference: e.reference },
      data: { order_id: e.orderId },
    });
  }
}
