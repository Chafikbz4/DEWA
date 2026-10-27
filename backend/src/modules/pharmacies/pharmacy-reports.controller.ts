import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { and, asc, count, desc, eq, gte, lt, sql, SQL } from 'drizzle-orm';
import type { PharmacyContext } from '../../common/auth/auth-user';
import { Roles } from '../../common/auth/decorators';
import {
  CurrentPharmacy,
  MyPharmacy,
} from '../../common/auth/pharmacy-access.guard';
import { Paginated } from '../../common/http/envelope';
import { PaginationQueryDto } from '../../common/http/pagination.dto';
import { ApiErrors } from '../../common/swagger/api-responses';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  offers,
  orders,
  requestRecipients,
  settlements,
} from '../../database/schema';

class RangeQueryDto {
  @ApiPropertyOptional({ description: 'Start (ISO). Default: 30 days ago.' })
  @IsOptional()
  @IsDateString()
  from?: string;
  @ApiPropertyOptional({ description: 'End (ISO, exclusive). Default: now.' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

/** Orders counted as revenue once handed over. */
const REVENUE_STATUSES = ['DELIVERED', 'COMPLETED'];

@ApiTags('Pharmacy – reports & settlements')
@ApiBearerAuth()
@Roles('PHARMACY_OWNER', 'PHARMACIST')
@Controller('pharmacy')
export class PharmacyReportsController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get('reports/summary')
  @MyPharmacy({ staffRoles: ['OWNER', 'PHARMACIST'] })
  @ApiOperation({
    summary: 'Activity summary (OWNER, PHARMACIST)',
    description:
      'Requests received by recipient status, average response time, offers sent/accepted, conversion, orders by status, revenue (DELIVERED + COMPLETED, centimes).',
  })
  @ApiErrors(
    'ROLE_FORBIDDEN',
    'PHARMACY_ACCESS_DENIED',
    'PHARMACY_NOT_VERIFIED',
  )
  async summary(
    @CurrentPharmacy() ph: PharmacyContext,
    @Query() q: RangeQueryDto,
  ) {
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from
      ? new Date(q.from)
      : new Date(to.getTime() - 30 * 86_400_000);
    const inRange = (col: Parameters<typeof gte>[0]) =>
      and(gte(col, from), lt(col, to)) as SQL;

    const [recipients, response, offerStats, orderStats, recipientFlow] =
      await Promise.all([
      this.db
        .select({ status: requestRecipients.status, n: count() })
        .from(requestRecipients)
        .where(
          and(
            eq(requestRecipients.pharmacyId, ph.id),
            inRange(requestRecipients.sentAt),
          ),
        )
        .groupBy(requestRecipients.status),
      this.db
        .select({
          avg: sql<
            number | null
          >`round(avg(extract(epoch FROM (${requestRecipients.respondedAt} - ${requestRecipients.sentAt})) / 60))::int`,
        })
        .from(requestRecipients)
        .where(
          and(
            eq(requestRecipients.pharmacyId, ph.id),
            inRange(requestRecipients.sentAt),
            sql`${requestRecipients.respondedAt} IS NOT NULL`,
          ),
        ),
      this.db
        .select({ status: offers.status, n: count() })
        .from(offers)
        .where(
          and(
            eq(offers.pharmacyId, ph.id),
            sql`${offers.sentAt} IS NOT NULL`,
            inRange(offers.sentAt),
          ),
        )
        .groupBy(offers.status),
      this.db
        .select({
          status: orders.status,
          n: count(),
          total: sql<number>`coalesce(sum(${orders.totalCentimes}), 0)::bigint`,
        })
        .from(orders)
        .where(and(eq(orders.pharmacyId, ph.id), inRange(orders.createdAt)))
        .groupBy(orders.status),
      // Demo fulfilment runs on request_recipients: accepted amount becomes
      // revenue once the pharmacy marks the order picked up or delivered.
      this.db
        .select({
          accepted: sql<number>`count(*) FILTER (WHERE ${requestRecipients.status} = 'ACCEPTED')::int`,
          settled: sql<number>`count(*) FILTER (WHERE ${requestRecipients.fulfillmentStatus} IN ('DELIVERED', 'PICKED_UP'))::int`,
          revenue: sql<number>`coalesce(sum(${requestRecipients.quotedAmountCentimes}) FILTER (WHERE ${requestRecipients.fulfillmentStatus} IN ('DELIVERED', 'PICKED_UP')), 0)::bigint`,
        })
        .from(requestRecipients)
        .where(
          and(
            eq(requestRecipients.pharmacyId, ph.id),
            inRange(requestRecipients.sentAt),
          ),
        ),
    ]);
    const byStatus = (rows: { status: string; n: number }[]) =>
      Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
    const offersSent = offerStats.reduce((s, r) => s + Number(r.n), 0);
    const accepted = offerStats.find((r) => r.status === 'ACCEPTED')?.n ?? 0;
    const flow = recipientFlow[0] ?? { accepted: 0, settled: 0, revenue: 0 };
    const requestsAccepted = Number(flow.accepted ?? 0);
    const ordersSettled = Number(flow.settled ?? 0);
    const orderRevenue = orderStats
      .filter((o) => REVENUE_STATUSES.includes(o.status))
      .reduce((s, o) => s + Number(o.total), 0);
    const settledRevenue = Number(flow.revenue ?? 0);
    const offersSentTotal = offersSent + requestsAccepted;
    const offersAcceptedTotal = Number(accepted) + requestsAccepted;
    return {
      from,
      to,
      requests_received: recipients.reduce((s, r) => s + Number(r.n), 0),
      requests_by_recipient_status: byStatus(recipients),
      avg_response_minutes: response[0]?.avg ?? null,
      // Includes request-based acceptances (demo flow) alongside formal offers.
      offers_sent: offersSentTotal,
      offers_accepted: offersAcceptedTotal,
      requests_accepted: requestsAccepted,
      orders_settled: ordersSettled,
      conversion_rate: offersSentTotal
        ? Math.round((offersAcceptedTotal / offersSentTotal) * 1000) / 1000
        : null,
      orders_by_status: byStatus(orderStats),
      // Money the pharmacy has earned: handed-over orders from either flow.
      revenue_centimes: orderRevenue + settledRevenue,
    };
  }

  @Get('settlements')
  @MyPharmacy({ staffRoles: ['OWNER'] })
  @ApiOperation({
    summary: 'Settlement records (OWNER)',
    description:
      'Records only unless the payout model is legally confirmed (see Phase 7).',
  })
  @ApiErrors(
    'ROLE_FORBIDDEN',
    'PHARMACY_ACCESS_DENIED',
    'PHARMACY_NOT_VERIFIED',
  )
  async settlements(
    @CurrentPharmacy() ph: PharmacyContext,
    @Query() q: PaginationQueryDto,
  ) {
    const where = eq(settlements.pharmacyId, ph.id);
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
        period_start: s.periodStart,
        period_end: s.periodEnd,
        gross_centimes: s.grossCentimes,
        commission_centimes: s.commissionCentimes,
        refunds_centimes: s.refundsCentimes,
        net_centimes: s.netCentimes,
        status: s.status,
        paid_at: s.paidAt,
        payout_reference: s.payoutReference,
      })),
      total,
      q.page,
      q.limit,
    );
  }
}
