import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql, SQL } from 'drizzle-orm';
import { AppException } from '../../common/errors/app.exception';
import { Database, DRIZZLE } from '../../database/database.module';
import { communes, pharmacies, wilayas } from '../../database/schema';
import {
  coversAddressSql,
  isOpenNowSql,
  pointSql,
} from '../pharmacies/pharmacy-sql';
import { SettingsService } from '../settings/settings.service';

export interface MatchInput {
  wilayaId: number;
  communeId: number;
  latitude: number | null;
  longitude: number | null;
  deliveryWanted: boolean;
  /** Patient-chosen pharmacies; when omitted the platform picks them. */
  pharmacyIds?: string[];
}

export interface MatchedPharmacy {
  id: string;
  name_fr: string;
  name_ar: string;
  address_line: string;
  commune_name_fr: string;
  commune_name_ar: string;
  wilaya_name_fr: string;
  distance_m: number | null;
  open_now: boolean;
  delivery_available: boolean;
}

/**
 * Selects the pharmacies a request goes to:
 * VERIFIED + accepts_requests + (delivery_available if delivery wanted)
 * + service area covers the address + (open now / on duty when
 * `matching_only_open_pharmacies`), closest first, limited by
 * `max_pharmacies_per_request`.
 */
@Injectable()
export class MatchingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly settings: SettingsService,
  ) {}

  async match(input: MatchInput): Promise<MatchedPharmacy[]> {
    const max = await this.settings.get('max_pharmacies_per_request');
    const point =
      input.latitude !== null && input.longitude !== null
        ? pointSql(input.latitude, input.longitude)
        : null;
    const distance = point
      ? sql<
          number | null
        >`CASE WHEN ${pharmacies.location} IS NULL THEN NULL ELSE ST_Distance(${pharmacies.location}, ${point}) END`
      : sql<number | null>`NULL::double precision`;

    const base: SQL[] = [
      eq(pharmacies.status, 'VERIFIED'),
      eq(pharmacies.acceptsRequests, true),
    ];
    if (input.deliveryWanted) base.push(eq(pharmacies.deliveryAvailable, true));

    const select = {
      p: pharmacies,
      communeFr: communes.nameFr,
      communeAr: communes.nameAr,
      wilayaFr: wilayas.nameFr,
      distance,
      openNow: isOpenNowSql(),
    };

    let rows;
    if (input.pharmacyIds?.length) {
      const unique = [...new Set(input.pharmacyIds)];
      if (unique.length > max)
        throw new AppException('REQUEST_TOO_MANY_PHARMACIES', null, { max });
      rows = await this.db
        .select(select)
        .from(pharmacies)
        .innerJoin(communes, eq(communes.id, pharmacies.communeId))
        .innerJoin(wilayas, eq(wilayas.id, pharmacies.wilayaId))
        .where(and(inArray(pharmacies.id, unique), ...base));
      const found = new Set(rows.map((r) => r.p.id));
      const rejected = unique.filter((id) => !found.has(id));
      if (rejected.length)
        throw new AppException('REQUEST_PHARMACY_NOT_ELIGIBLE', {
          pharmacy_ids: rejected,
        });
    } else {
      const conditions = [
        ...base,
        coversAddressSql(input.wilayaId, input.communeId, point),
      ];
      if (await this.settings.get('matching_only_open_pharmacies'))
        conditions.push(isOpenNowSql());
      rows = await this.db
        .select(select)
        .from(pharmacies)
        .innerJoin(communes, eq(communes.id, pharmacies.communeId))
        .innerJoin(wilayas, eq(wilayas.id, pharmacies.wilayaId))
        .where(and(...conditions))
        .orderBy(
          sql`${distance} ASC NULLS LAST`,
          sql`${pharmacies.avgResponseMinutes} ASC NULLS LAST`,
          pharmacies.createdAt,
        )
        .limit(max);

      // A service-area miss must not prevent the patient request from being
      // published. Pharmacies in the same Wilaya can still review and claim it.
      if (!rows.length) {
        rows = await this.db
          .select(select)
          .from(pharmacies)
          .innerJoin(communes, eq(communes.id, pharmacies.communeId))
          .innerJoin(wilayas, eq(wilayas.id, pharmacies.wilayaId))
          .where(and(...base, eq(pharmacies.wilayaId, input.wilayaId)))
          .orderBy(
            sql`${distance} ASC NULLS LAST`,
            sql`${pharmacies.avgResponseMinutes} ASC NULLS LAST`,
            pharmacies.createdAt,
          )
          .limit(max);
      }
    }

    return rows.map((r) => ({
      id: r.p.id,
      name_fr: r.p.nameFr,
      name_ar: r.p.nameAr,
      address_line: r.p.addressLine,
      commune_name_fr: r.communeFr,
      commune_name_ar: r.communeAr,
      wilaya_name_fr: r.wilayaFr,
      distance_m: r.distance === null ? null : Math.round(Number(r.distance)),
      open_now: !!r.openNow,
      delivery_available: r.p.deliveryAvailable,
    }));
  }
}
