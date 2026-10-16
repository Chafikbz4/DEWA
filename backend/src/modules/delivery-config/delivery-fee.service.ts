import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { AppException } from '../../common/errors/app.exception';
import { Database, DRIZZLE } from '../../database/database.module';
import { deliveryFeeRules, deliveryZones } from '../../database/schema';

export interface FeeInput {
  wilayaId: number;
  communeId: number;
  from: { latitude: number | null; longitude: number | null };
  to: { latitude: number | null; longitude: number | null };
}

/**
 * Delivery fee = base + per_km × distance(pharmacy → address), clamped to
 * [min, max]. The most specific active zone wins (commune zone over a
 * whole-wilaya zone), latest effective_from first. Never trusted from clients.
 */
@Injectable()
export class DeliveryFeeService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async compute(input: FeeInput): Promise<{
    feeCentimes: number;
    distanceKm: number | null;
    ruleId: string;
  }> {
    const [rule] = await this.db
      .select({ r: deliveryFeeRules })
      .from(deliveryFeeRules)
      .innerJoin(deliveryZones, eq(deliveryZones.id, deliveryFeeRules.zoneId))
      .where(
        and(
          eq(deliveryZones.isActive, true),
          eq(deliveryFeeRules.isActive, true),
          eq(deliveryZones.wilayaId, input.wilayaId),
          or(
            eq(deliveryZones.communeId, input.communeId),
            isNull(deliveryZones.communeId),
          ),
          lte(deliveryFeeRules.effectiveFrom, new Date()),
        ),
      )
      .orderBy(
        sql`${deliveryZones.communeId} IS NULL`,
        desc(deliveryFeeRules.effectiveFrom),
      )
      .limit(1);
    if (!rule) throw new AppException('DELIVERY_ZONE_NOT_COVERED');

    const distanceKm = await this.distanceKm(input.from, input.to);
    const r = rule.r;
    let fee =
      r.baseFeeCentimes + Math.round((distanceKm ?? 0) * r.perKmCentimes);
    if (r.minFeeCentimes !== null) fee = Math.max(fee, r.minFeeCentimes);
    if (r.maxFeeCentimes !== null) fee = Math.min(fee, r.maxFeeCentimes);
    return { feeCentimes: fee, distanceKm, ruleId: r.id };
  }

  async distanceKm(
    from: { latitude: number | null; longitude: number | null },
    to: { latitude: number | null; longitude: number | null },
  ): Promise<number | null> {
    if (
      from.latitude === null ||
      from.longitude === null ||
      to.latitude === null ||
      to.longitude === null
    )
      return null;
    const { rows } = await this.db.execute<{ m: number }>(
      sql`SELECT ST_Distance(
            ST_SetSRID(ST_MakePoint(${from.longitude}::float8, ${from.latitude}::float8), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${to.longitude}::float8, ${to.latitude}::float8), 4326)::geography) AS m`,
    );
    return Math.round((Number(rows[0].m) / 1000) * 10) / 10;
  }
}
