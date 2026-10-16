import { sql, SQL } from 'drizzle-orm';
import { pharmacies } from '../../database/schema';

/** Algeria is UTC+1 all year (no DST). Opening hours are local times. */
const LOCAL_NOW = sql`(now() AT TIME ZONE 'Africa/Algiers')`;

/**
 * TRUE when the pharmacy is on duty (garde) now, or open according to today's
 * opening hours (overnight ranges such as 20:00–02:00 supported for the
 * current day).
 */
export function isOpenNowSql(
  pharmacyId: SQL | typeof pharmacies.id = pharmacies.id,
): SQL<boolean> {
  return sql<boolean>`(
    EXISTS (
      SELECT 1 FROM pharmacy_on_duty_schedule d
      WHERE d.pharmacy_id = ${pharmacyId} AND now() >= d.date_from AND now() < d.date_to
    )
    OR EXISTS (
      SELECT 1 FROM pharmacy_opening_hours h
      WHERE h.pharmacy_id = ${pharmacyId}
        AND h.day_of_week = EXTRACT(DOW FROM ${LOCAL_NOW})::int
        AND NOT h.is_closed
        AND (
          h.is_24h
          OR (h.open_time <= h.close_time AND ${LOCAL_NOW}::time >= h.open_time AND ${LOCAL_NOW}::time < h.close_time)
          OR (h.open_time > h.close_time AND (${LOCAL_NOW}::time >= h.open_time OR ${LOCAL_NOW}::time < h.close_time))
        )
    )
  )`;
}

export function isOnDutyNowSql(
  pharmacyId: SQL | typeof pharmacies.id = pharmacies.id,
): SQL<boolean> {
  return sql<boolean>`EXISTS (
    SELECT 1 FROM pharmacy_on_duty_schedule d
    WHERE d.pharmacy_id = ${pharmacyId} AND now() >= d.date_from AND now() < d.date_to
  )`;
}

export const pointSql = (lat: number, lng: number) =>
  sql`ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326)::geography`;

/**
 * TRUE when one of the pharmacy's service areas covers the address:
 * same wilaya, commune NULL (whole wilaya) or equal, and within max_radius_km
 * when set. Pharmacies without any service area only cover their own commune.
 */
export function coversAddressSql(
  wilayaId: number,
  communeId: number,
  point: SQL | null,
  pharmacyId: SQL | typeof pharmacies.id = pharmacies.id,
): SQL<boolean> {
  const radiusCheck = point
    ? sql`(sa.max_radius_km IS NULL OR (${pharmacies.location} IS NOT NULL AND ST_DWithin(${pharmacies.location}, ${point}, sa.max_radius_km * 1000)))`
    : sql`sa.max_radius_km IS NULL`;
  return sql<boolean>`(
    EXISTS (
      SELECT 1 FROM pharmacy_service_areas sa
      WHERE sa.pharmacy_id = ${pharmacyId}
        AND sa.wilaya_id = ${wilayaId}
        AND (sa.commune_id IS NULL OR sa.commune_id = ${communeId})
        AND ${radiusCheck}
    )
    OR (
      NOT EXISTS (SELECT 1 FROM pharmacy_service_areas sa2 WHERE sa2.pharmacy_id = ${pharmacyId})
      AND ${pharmacies.communeId} = ${communeId}
    )
  )`;
}
