import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { and, asc, eq, inArray, isNotNull, sql, SQL } from 'drizzle-orm';
import { Public } from '../../common/auth/decorators';
import { Paginated } from '../../common/http/envelope';
import { ApiEnvelope, ApiErrors } from '../../common/swagger/api-responses';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  communes,
  pharmacies,
  pharmacyOpeningHours,
  wilayas,
} from '../../database/schema';
import { isOnDutyNowSql, isOpenNowSql, pointSql } from './pharmacy-sql';

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

class NearbyQueryDto {
  @ApiProperty({ example: 36.7538 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 3.0588 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @ApiPropertyOptional({
    description: 'Radius in km',
    default: 5,
    minimum: 0.1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(50)
  radius: number = 5;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Only pharmacies open now or on duty (garde).',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  open_now?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Only pharmacies offering delivery.',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  delivery?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

class OpeningHoursDto {
  @ApiProperty({ example: 0, description: '0 = Sunday … 6 = Saturday' })
  day_of_week!: number;
  @ApiPropertyOptional({ example: '08:00:00', nullable: true }) open_time!:
    string | null;
  @ApiPropertyOptional({ example: '20:00:00', nullable: true }) close_time!:
    string | null;
  @ApiProperty() is_closed!: boolean;
  @ApiProperty() is_24h!: boolean;
}

class NearbyPharmacyDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Pharmacie El Amel' }) name_fr!: string;
  @ApiProperty({ example: 'صيدلية الأمل' }) name_ar!: string;
  @ApiProperty({ example: '12 Rue Didouche Mourad' }) address_line!: string;
  @ApiProperty({ example: 'Alger Centre' }) commune_name_fr!: string;
  @ApiProperty({ example: 'الجزائر الوسطى' }) commune_name_ar!: string;
  @ApiProperty({ example: 'Alger' }) wilaya_name_fr!: string;
  @ApiProperty({ example: 'الجزائر' }) wilaya_name_ar!: string;
  @ApiPropertyOptional({ nullable: true }) latitude!: number | null;
  @ApiPropertyOptional({ nullable: true }) longitude!: number | null;
  @ApiPropertyOptional({ nullable: true, example: '+21321000000' }) phone!:
    string | null;
  @ApiProperty({ example: 820, description: 'Distance in metres' })
  distance_m!: number;
  @ApiProperty() delivery_available!: boolean;
  @ApiProperty() open_now!: boolean;
  @ApiProperty({ description: 'On duty (garde) right now' })
  on_duty_now!: boolean;
  @ApiProperty({ type: [OpeningHoursDto] }) opening_hours!: OpeningHoursDto[];
}

@ApiTags('Pharmacies – public')
@Public()
@Controller('pharmacies')
export class PublicPharmaciesController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get('nearby')
  @ApiOperation({
    summary: 'Verified pharmacies near a point (public)',
    description:
      'Public fields only. Sorted by distance. open_now uses Algiers local time and on-duty (garde) periods.',
  })
  @ApiEnvelope(NearbyPharmacyDto, { paginated: true })
  @ApiErrors()
  async nearby(@Query() q: NearbyQueryDto) {
    const point = pointSql(q.lat, q.lng);
    const conditions: SQL[] = [
      eq(pharmacies.status, 'VERIFIED'),
      isNotNull(pharmacies.location),
      sql`ST_DWithin(${pharmacies.location}, ${point}, ${q.radius * 1000})`,
    ];
    if (q.open_now) conditions.push(isOpenNowSql());
    if (q.delivery) conditions.push(eq(pharmacies.deliveryAvailable, true));
    const where = and(...conditions);
    const distance = sql<number>`ST_Distance(${pharmacies.location}, ${point})`;

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          p: pharmacies,
          communeFr: communes.nameFr,
          communeAr: communes.nameAr,
          wilayaFr: wilayas.nameFr,
          wilayaAr: wilayas.nameAr,
          distance,
          openNow: isOpenNowSql(),
          onDuty: isOnDutyNowSql(),
        })
        .from(pharmacies)
        .innerJoin(communes, eq(communes.id, pharmacies.communeId))
        .innerJoin(wilayas, eq(wilayas.id, pharmacies.wilayaId))
        .where(where)
        .orderBy(asc(distance))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(pharmacies)
        .where(where),
    ]);

    const ids = rows.map((r) => r.p.id);
    const hours = ids.length
      ? await this.db
          .select()
          .from(pharmacyOpeningHours)
          .where(inArray(pharmacyOpeningHours.pharmacyId, ids))
      : [];

    const items: NearbyPharmacyDto[] = rows.map((r) => ({
      id: r.p.id,
      name_fr: r.p.nameFr,
      name_ar: r.p.nameAr,
      address_line: r.p.addressLine,
      commune_name_fr: r.communeFr,
      commune_name_ar: r.communeAr,
      wilaya_name_fr: r.wilayaFr,
      wilaya_name_ar: r.wilayaAr,
      latitude: r.p.latitude,
      longitude: r.p.longitude,
      phone: r.p.phone,
      distance_m: Math.round(Number(r.distance)),
      delivery_available: r.p.deliveryAvailable,
      open_now: !!r.openNow,
      on_duty_now: !!r.onDuty,
      opening_hours: hours
        .filter((h) => h.pharmacyId === r.p.id)
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
        .map((h) => ({
          day_of_week: h.dayOfWeek,
          open_time: h.openTime,
          close_time: h.closeTime,
          is_closed: h.isClosed,
          is_24h: h.is24h,
        })),
    }));
    return Paginated.of(items, Number(total), q.page, q.limit);
  }
}
