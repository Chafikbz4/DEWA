import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  sql,
  SQL,
} from 'drizzle-orm';
import { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  commissionRules,
  orders,
  payments,
  refunds,
  settlementLines,
  settlements,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';

/** Periods are aligned on this Monday (UTC) in multiples of settlement_period_days. */
const PERIOD_ANCHOR = Date.UTC(2026, 0, 5);
const DAY = 86_400_000;

type Rule = typeof commissionRules.$inferSelect;

/**
 * Settlement RECORDS per pharmacy and period: gross (handed-over paid
 * orders), commission (active rule: pharmacy-specific first, else global),
 * completed refunds, net. RECORDS ONLY – no money is moved unless the
 * commercial/legal model (payment_collection_model) allows platform payouts.
 */
@Injectable()
export class SettlementsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async previousPeriod(now = new Date()) {
    const days = await this.settings.get('settlement_period_days');
    const len = days * DAY;
    const idx = Math.floor((now.getTime() - PERIOD_ANCHOR) / len);
    const start = new Date(PERIOD_ANCHOR + (idx - 1) * len);
    return { start, end: new Date(start.getTime() + len) };
  }

  private commissionFor(rules: Rule[], pharmacyId: string, subtotal: number) {
    const rule =
      rules.find(
        (r) => r.scope === 'PHARMACY' && r.pharmacyId === pharmacyId,
      ) ?? rules.find((r) => r.scope === 'GLOBAL');
    if (!rule) return 0;
    if (rule.type === 'PERCENT')
      return Math.round((subtotal * rule.value) / 10_000);
    if (rule.type === 'FIXED') return rule.value;
    return 0; // SUBSCRIPTION is billed separately, not per order.
  }

  /** Idempotent: an existing settlement for (pharmacy, period) is left untouched. */
  async generate(start: Date, end: Date) {
    const startDate = start.toISOString().slice(0, 10);
    const endDate = new Date(end.getTime() - DAY).toISOString().slice(0, 10);
    const rules = await this.db
      .select()
      .from(commissionRules)
      .where(eq(commissionRules.isActive, true));
    const handed = await this.db
      .select({ o: orders })
      .from(orders)
      .where(
        and(
          inArray(orders.status, ['DELIVERED', 'COMPLETED']),
          gte(orders.statusChangedAt, start),
          lt(orders.statusChangedAt, end),
        ),
      );
    const byPharmacy = new Map<string, (typeof orders.$inferSelect)[]>();
    for (const { o } of handed)
      byPharmacy.set(o.pharmacyId, [
        ...(byPharmacy.get(o.pharmacyId) ?? []),
        o,
      ]);

    let created = 0;
    for (const [pharmacyId, list] of byPharmacy) {
      const [exists] = await this.db
        .select({ id: settlements.id })
        .from(settlements)
        .where(
          and(
            eq(settlements.pharmacyId, pharmacyId),
            eq(settlements.periodStart, startDate),
            eq(settlements.periodEnd, endDate),
          ),
        )
        .limit(1);
      if (exists) continue;
      const paid = await this.db
        .select({ orderId: payments.orderId })
        .from(payments)
        .where(
          and(
            inArray(
              payments.orderId,
              list.map((o) => o.id),
            ),
            inArray(payments.status, [
              'CONFIRMED',
              'REFUND_PENDING',
              'REFUNDED',
            ]),
          ),
        );
      const paidIds = new Set(paid.map((p) => p.orderId));
      const lines = list
        .filter((o) => paidIds.has(o.id))
        .map((o) => ({
          orderId: o.id,
          amountCentimes: o.totalCentimes,
          commissionCentimes: this.commissionFor(
            rules,
            pharmacyId,
            o.itemsSubtotalCentimes,
          ),
        }));
      if (!lines.length) continue;
      const [{ refunded }] = await this.db
        .select({
          refunded: sql<number>`coalesce(sum(${refunds.amountCentimes}), 0)::bigint`,
        })
        .from(refunds)
        .innerJoin(orders, eq(orders.id, refunds.orderId))
        .where(
          and(
            eq(orders.pharmacyId, pharmacyId),
            eq(refunds.status, 'COMPLETED'),
            gte(refunds.completedAt, start),
            lt(refunds.completedAt, end),
          ),
        );
      const gross = lines.reduce((s, l) => s + l.amountCentimes, 0);
      const commission = lines.reduce((s, l) => s + l.commissionCentimes, 0);
      await this.db.transaction(async (tx) => {
        const [st] = await tx
          .insert(settlements)
          .values({
            pharmacyId,
            periodStart: startDate,
            periodEnd: endDate,
            grossCentimes: gross,
            commissionCentimes: commission,
            refundsCentimes: Number(refunded),
            netCentimes: gross - commission - Number(refunded),
            status: 'DRAFT',
          })
          .returning({ id: settlements.id });
        await tx
          .insert(settlementLines)
          .values(lines.map((l) => ({ ...l, settlementId: st.id })));
      });
      created++;
    }
    return { period_start: startDate, period_end: endDate, created };
  }

  async list(q: {
    page: number;
    limit: number;
    offset: number;
    order: 'asc' | 'desc';
    status?: string;
    pharmacy_id?: string;
  }) {
    const conditions: SQL[] = [];
    if (q.status) conditions.push(eq(settlements.status, q.status as never));
    if (q.pharmacy_id)
      conditions.push(eq(settlements.pharmacyId, q.pharmacy_id));
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(settlements)
        .where(where)
        .orderBy(
          q.order === 'asc'
            ? asc(settlements.periodStart)
            : desc(settlements.periodStart),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(settlements).where(where),
    ]);
    return Paginated.of(
      rows.map((s) => ({
        id: s.id,
        pharmacy_id: s.pharmacyId,
        period_start: s.periodStart,
        period_end: s.periodEnd,
        gross_centimes: s.grossCentimes,
        commission_centimes: s.commissionCentimes,
        refunds_centimes: s.refundsCentimes,
        net_centimes: s.netCentimes,
        status: s.status,
        paid_at: s.paidAt,
        payout_reference: s.payoutReference,
        records_only: true,
      })),
      total,
      q.page,
      q.limit,
    );
  }

  async approve(admin: AuthUser, id: string, meta: RequestMeta) {
    const [s] = await this.db
      .update(settlements)
      .set({ status: 'APPROVED' })
      .where(and(eq(settlements.id, id), eq(settlements.status, 'DRAFT')))
      .returning();
    if (!s) throw new AppException('SETTLEMENT_INVALID_STATE');
    await this.audit.log({
      action: 'SETTLEMENT_APPROVED',
      actorUserId: admin.id,
      actorRole: admin.role,
      resourceType: 'settlement',
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { id: s.id, status: s.status };
  }

  async markPaid(
    admin: AuthUser,
    id: string,
    payoutReference: string,
    meta: RequestMeta,
  ) {
    const [s] = await this.db
      .update(settlements)
      .set({ status: 'PAID', paidAt: new Date(), payoutReference })
      .where(and(eq(settlements.id, id), eq(settlements.status, 'APPROVED')))
      .returning();
    if (!s) throw new AppException('SETTLEMENT_INVALID_STATE');
    await this.audit.log({
      action: 'SETTLEMENT_MARKED_PAID',
      actorUserId: admin.id,
      actorRole: admin.role,
      resourceType: 'settlement',
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { payout_reference: payoutReference },
    });
    return {
      id: s.id,
      status: s.status,
      paid_at: s.paidAt,
      payout_reference: s.payoutReference,
    };
  }
}
