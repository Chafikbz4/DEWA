import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, lt, sql, SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { Database, DRIZZLE } from '../../database/database.module';
import { auditLogs } from '../../database/schema';
import { AuditService } from '../audit/audit.service';

const DAY = 86_400_000;
const EXPORT_MAX = 10_000;

/** Audit actions that describe security events. */
export const SECURITY_ACTIONS = [
  'AUTH_LOGIN_FAILED',
  'AUTH_ACCOUNT_LOCKED',
  'AUTH_MFA_FAILED',
  'AUTH_REFRESH_REUSE_DETECTED',
  'AUTH_SESSION_REVOKED',
  'PAYMENT_WEBHOOK_REJECTED',
  'SENSITIVE_DATA_ACCESSED',
  'USER_STATUS_CHANGED',
  'USER_ROLE_CHANGED',
  'ADMIN_SUB_ROLES_CHANGED',
  'ADMIN_ROLE_PERMISSIONS_CHANGED',
];

export interface AuditQuery {
  page: number;
  limit: number;
  offset: number;
  actor_user_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  from?: string;
  to?: string;
}

const presentAudit = (a: typeof auditLogs.$inferSelect) => ({
  id: a.id,
  created_at: a.createdAt,
  actor_user_id: a.actorUserId,
  actor_role: a.actorRole,
  action: a.action,
  resource_type: a.resourceType,
  resource_id: a.resourceId,
  ip: a.ip,
  user_agent: a.userAgent,
  reason: a.reason,
  metadata: a.metadata,
});

const csvCell = (v: unknown) => {
  const s =
    v === null || v === undefined
      ? ''
      : typeof v === 'object'
        ? JSON.stringify(v)
        : String(v);
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Analytics, audit trail, security events and the finance dashboard. */
@Injectable()
export class AdminInsightsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  private range(q: { from?: string; to?: string }) {
    const to = q.to
      ? new Date(`${q.to.slice(0, 10)}T00:00:00Z`)
      : new Date(new Date().toISOString().slice(0, 10));
    const from = q.from
      ? new Date(`${q.from.slice(0, 10)}T00:00:00Z`)
      : new Date(to.getTime() - 29 * DAY);
    if (from > to)
      throw new AppException('VALIDATION_FAILED', { from: 'must be <= to' });
    if (to.getTime() - from.getTime() > 366 * DAY)
      throw new AppException('VALIDATION_FAILED', { range: 'max 366 days' });
    return { from, toEx: new Date(to.getTime() + DAY) };
  }

  // ------------------------------------------------------------- analytics

  async overview(q: { from?: string; to?: string; wilaya_id?: number }) {
    const { from, toEx } = this.range(q);
    const w = q.wilaya_id ?? null;
    const reqWilaya = w
      ? sql`AND (r.delivery_address_snapshot->>'wilaya_id')::int = ${w}`
      : sql``;
    const phWilaya = w ? sql`AND p.wilaya_id = ${w}` : sql``;
    const rows = async <T>(query: SQL) =>
      (await this.db.execute<T & Record<string, unknown>>(query)).rows;

    const [requests] = await rows<{ total: number; with_order: number }>(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE EXISTS (SELECT 1 FROM orders o WHERE o.request_id = r.id))::int AS with_order
      FROM requests r WHERE r.created_at >= ${from} AND r.created_at < ${toEx} ${reqWilaya}`);
    const [offersAgg] = await rows<{
      sent: number;
      accepted: number;
      avg_response_minutes: number | null;
    }>(sql`
      SELECT count(*) FILTER (WHERE f.sent_at IS NOT NULL)::int AS sent,
             count(*) FILTER (WHERE f.status = 'ACCEPTED')::int AS accepted,
             avg(EXTRACT(epoch FROM (f.sent_at - r.created_at)) / 60) FILTER (WHERE f.sent_at IS NOT NULL) AS avg_response_minutes
      FROM offers f JOIN requests r ON r.id = f.request_id JOIN pharmacies p ON p.id = f.pharmacy_id
      WHERE r.created_at >= ${from} AND r.created_at < ${toEx} ${phWilaya}`);
    const byStatus = await rows<{ status: string; n: number }>(sql`
      SELECT o.status, count(*)::int AS n FROM orders o JOIN pharmacies p ON p.id = o.pharmacy_id
      WHERE o.created_at >= ${from} AND o.created_at < ${toEx} ${phWilaya} GROUP BY o.status`);
    const paidOrders = sql`SELECT o.id, o.total_centimes, o.created_at, p.wilaya_id FROM orders o JOIN pharmacies p ON p.id = o.pharmacy_id
      WHERE o.created_at >= ${from} AND o.created_at < ${toEx} ${phWilaya}
        AND EXISTS (SELECT 1 FROM payments y WHERE y.order_id = o.id AND y.status IN ('CONFIRMED','REFUND_PENDING','REFUNDED'))`;
    const [gmv] = await rows<{
      gmv: string;
      refunds: string;
      paid_orders: number;
    }>(sql`
      SELECT coalesce(sum(x.total_centimes), 0)::bigint AS gmv, count(*)::int AS paid_orders,
             (SELECT coalesce(sum(rf.amount_centimes), 0)::bigint FROM refunds rf WHERE rf.status = 'COMPLETED' AND rf.order_id IN (SELECT id FROM (${paidOrders}) y)) AS refunds
      FROM (${paidOrders}) x`);
    const [delivery] = await rows<{ delivered: number; failed: number }>(sql`
      SELECT count(*) FILTER (WHERE d.status = 'DELIVERED')::int AS delivered,
             count(*) FILTER (WHERE d.status IN ('FAILED','RETURNED'))::int AS failed
      FROM deliveries d JOIN orders o ON o.id = d.order_id JOIN pharmacies p ON p.id = o.pharmacy_id
      WHERE d.created_at >= ${from} AND d.created_at < ${toEx} ${phWilaya}`);
    const byWilaya = await rows<{
      wilaya_id: number;
      requests: number;
      orders: number;
      gmv: string;
    }>(sql`
      SELECT w.id AS wilaya_id,
             (SELECT count(*)::int FROM requests r WHERE (r.delivery_address_snapshot->>'wilaya_id')::int = w.id AND r.created_at >= ${from} AND r.created_at < ${toEx}) AS requests,
             (SELECT count(*)::int FROM orders o JOIN pharmacies p ON p.id = o.pharmacy_id WHERE p.wilaya_id = w.id AND o.created_at >= ${from} AND o.created_at < ${toEx}) AS orders,
             (SELECT coalesce(sum(x.total_centimes), 0)::bigint FROM (${paidOrders}) x WHERE x.wilaya_id = w.id) AS gmv
      FROM wilayas w ${w ? sql`WHERE w.id = ${w}` : sql``} ORDER BY w.id`);
    const byDate = await rows<{
      date: string;
      requests: number;
      orders: number;
      gmv: string;
    }>(sql`
      SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
             (SELECT count(*)::int FROM requests r WHERE r.created_at >= d.day AND r.created_at < d.day + interval '1 day' ${reqWilaya}) AS requests,
             (SELECT count(*)::int FROM orders o JOIN pharmacies p ON p.id = o.pharmacy_id WHERE o.created_at >= d.day AND o.created_at < d.day + interval '1 day' ${phWilaya}) AS orders,
             (SELECT coalesce(sum(x.total_centimes), 0)::bigint FROM (${paidOrders}) x WHERE x.created_at >= d.day AND x.created_at < d.day + interval '1 day') AS gmv
      FROM generate_series(${from}::timestamptz, ${new Date(toEx.getTime() - DAY)}::timestamptz, interval '1 day') AS d(day) ORDER BY d.day`);

    const finished = delivery.delivered + delivery.failed;
    return {
      from: from.toISOString().slice(0, 10),
      to: new Date(toEx.getTime() - DAY).toISOString().slice(0, 10),
      wilaya_id: w,
      requests: {
        total: requests.total,
        with_order: requests.with_order,
        conversion_rate: requests.total
          ? Math.round((requests.with_order / requests.total) * 1000) / 10
          : null,
      },
      offers: {
        sent: offersAgg.sent,
        accepted: offersAgg.accepted,
        conversion_rate: offersAgg.sent
          ? Math.round((offersAgg.accepted / offersAgg.sent) * 1000) / 10
          : null,
        average_response_minutes:
          offersAgg.avg_response_minutes == null
            ? null
            : Math.round(Number(offersAgg.avg_response_minutes)),
      },
      orders_by_status: Object.fromEntries(
        byStatus.map((r) => [r.status, r.n]),
      ),
      gmv_centimes: Number(gmv.gmv),
      refunds_centimes: Number(gmv.refunds),
      paid_orders: gmv.paid_orders,
      delivery: {
        delivered: delivery.delivered,
        failed: delivery.failed,
        success_rate: finished
          ? Math.round((delivery.delivered / finished) * 1000) / 10
          : null,
      },
      by_wilaya: byWilaya
        .filter((r) => r.requests || r.orders)
        .map((r) => ({
          wilaya_id: r.wilaya_id,
          requests: r.requests,
          orders: r.orders,
          gmv_centimes: Number(r.gmv),
        })),
      by_date: byDate.map((r) => ({
        date: r.date,
        requests: r.requests,
        orders: r.orders,
        gmv_centimes: Number(r.gmv),
      })),
      currency: 'DZD',
    };
  }

  // ------------------------------------------------------------ audit logs

  private auditWhere(
    q: Omit<AuditQuery, 'page' | 'limit' | 'offset'>,
    actions?: string[],
  ) {
    const c: SQL[] = [];
    if (q.actor_user_id) c.push(eq(auditLogs.actorUserId, q.actor_user_id));
    if (q.action) c.push(eq(auditLogs.action, q.action));
    if (actions) c.push(inArray(auditLogs.action, actions));
    if (q.resource_type) c.push(eq(auditLogs.resourceType, q.resource_type));
    if (q.resource_id) c.push(eq(auditLogs.resourceId, q.resource_id));
    if (q.from)
      c.push(
        gte(auditLogs.createdAt, new Date(`${q.from.slice(0, 10)}T00:00:00Z`)),
      );
    if (q.to)
      c.push(
        lt(
          auditLogs.createdAt,
          new Date(new Date(`${q.to.slice(0, 10)}T00:00:00Z`).getTime() + DAY),
        ),
      );
    return c.length ? and(...c) : undefined;
  }

  async auditLogs(q: AuditQuery, actions?: string[]) {
    const where = this.auditWhere(q, actions);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(auditLogs).where(where),
    ]);
    return Paginated.of(rows.map(presentAudit), total, q.page, q.limit);
  }

  /** CSV export (max 10 000 rows, newest first). The export itself is audited. */
  async exportAudit(
    admin: AuthUser,
    q: Omit<AuditQuery, 'page' | 'limit' | 'offset'>,
    meta: RequestMeta,
  ) {
    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(this.auditWhere(q))
      .orderBy(desc(auditLogs.createdAt))
      .limit(EXPORT_MAX);
    const header = [
      'id',
      'created_at',
      'actor_user_id',
      'actor_role',
      'action',
      'resource_type',
      'resource_id',
      'ip',
      'reason',
      'metadata',
    ];
    const lines = rows.map((a) => {
      const p = presentAudit(a);
      return [
        p.id,
        p.created_at.toISOString(),
        p.actor_user_id,
        p.actor_role,
        p.action,
        p.resource_type,
        p.resource_id,
        p.ip,
        p.reason,
        p.metadata,
      ]
        .map(csvCell)
        .join(',');
    });
    await this.audit.log({
      action: 'AUDIT_LOGS_EXPORTED',
      actorUserId: admin.id,
      actorRole: admin.role,
      resourceType: 'audit_log',
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { filters: q, rows: rows.length },
    });
    return Buffer.from(`﻿${header.join(',')}\n${lines.join('\n')}\n`, 'utf8');
  }

  // --------------------------------------------------------------- security

  /** Security events + simple suspicious-activity signals over the last 24 h. */
  async securityEvents(q: AuditQuery) {
    const events = await this.auditLogs(
      q,
      q.action ? undefined : SECURITY_ACTIONS,
    );
    const since = new Date(Date.now() - DAY);
    const topIps = await this.db
      .select({ ip: auditLogs.ip, failures: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, 'AUTH_LOGIN_FAILED'),
          gte(auditLogs.createdAt, since),
        ),
      )
      .groupBy(auditLogs.ip)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    const [summary] = (
      await this.db.execute<{
        failed_logins: number;
        locked: number;
        refresh_reuse: number;
        mfa_failed: number;
        sensitive_reads: number;
      }>(sql`
        SELECT count(*) FILTER (WHERE action = 'AUTH_LOGIN_FAILED')::int AS failed_logins,
               count(*) FILTER (WHERE action = 'AUTH_ACCOUNT_LOCKED')::int AS locked,
               count(*) FILTER (WHERE action = 'AUTH_REFRESH_REUSE_DETECTED')::int AS refresh_reuse,
               count(*) FILTER (WHERE action = 'AUTH_MFA_FAILED')::int AS mfa_failed,
               count(*) FILTER (WHERE action = 'SENSITIVE_DATA_ACCESSED')::int AS sensitive_reads
        FROM audit_logs WHERE created_at >= ${since}`)
    ).rows;
    return events.withMeta({
      last_24h: {
        ...summary,
        suspicious_ips: topIps
          .filter((r) => r.failures >= 10)
          .map((r) => ({ ip: r.ip, failed_logins: r.failures })),
        top_failed_login_ips: topIps.map((r) => ({
          ip: r.ip,
          failed_logins: r.failures,
        })),
      },
    });
  }

  // ---------------------------------------------------------------- finance

  async financeDashboard() {
    const [r] = (
      await this.db.execute<Record<string, number | string>>(sql`
        SELECT
          (SELECT count(*)::int FROM payments WHERE status = 'PENDING') AS payments_pending,
          (SELECT count(*)::int FROM payments WHERE status = 'CONFIRMED' AND verified_server_side_at >= now() - interval '1 day') AS payments_confirmed_24h,
          (SELECT count(*)::int FROM payments WHERE status = 'FAILED' AND updated_at >= now() - interval '1 day') AS payments_failed_24h,
          (SELECT coalesce(sum(amount_centimes), 0)::bigint FROM payments WHERE status = 'CONFIRMED' AND verified_server_side_at >= now() - interval '1 day') AS captured_24h_centimes,
          (SELECT count(*)::int FROM refunds WHERE status IN ('REQUESTED','APPROVED')) AS refunds_to_process,
          (SELECT coalesce(sum(amount_centimes), 0)::bigint FROM refunds WHERE status IN ('REQUESTED','APPROVED')) AS refunds_to_process_centimes,
          (SELECT count(*)::int FROM settlements WHERE status = 'DRAFT') AS settlements_draft,
          (SELECT count(*)::int FROM settlements WHERE status = 'APPROVED') AS settlements_to_pay`)
    ).rows;
    const issues = await this.db.execute<{ kind: string; n: number }>(
      sql`SELECT kind, count(*)::int AS n FROM payment_reconciliation_issues WHERE status = 'OPEN' GROUP BY kind`,
    );
    const num = (v: number | string) => Number(v);
    return {
      payments_pending: num(r.payments_pending),
      payments_confirmed_24h: num(r.payments_confirmed_24h),
      payments_failed_24h: num(r.payments_failed_24h),
      captured_24h_centimes: num(r.captured_24h_centimes),
      refunds_to_process: num(r.refunds_to_process),
      refunds_to_process_centimes: num(r.refunds_to_process_centimes),
      settlements_draft: num(r.settlements_draft),
      settlements_to_pay: num(r.settlements_to_pay),
      open_reconciliation_issues: Object.fromEntries(
        issues.rows.map((i) => [i.kind, i.n]),
      ),
      currency: 'DZD',
    };
  }
}
