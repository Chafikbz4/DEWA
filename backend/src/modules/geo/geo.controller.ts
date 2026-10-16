import {
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { and, asc, count, desc, eq, ilike, or, SQL } from 'drizzle-orm';
import { Public } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { ApiEnvelope, ApiErrors } from '../../common/swagger/api-responses';
import { Database, DRIZZLE } from '../../database/database.module';
import { communes, wilayas } from '../../database/schema';

class GeoQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    default: 100,
    description:
      'Reference lists default to 100 (all wilayas fit in one page).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 100;

  @ApiPropertyOptional({ enum: ['id', 'name_fr', 'name_ar'], default: 'id' })
  @IsOptional()
  @IsIn(['id', 'name_fr', 'name_ar'])
  sort: 'id' | 'name_fr' | 'name_ar' = 'id';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional({
    description: 'Filter by name (fr or ar, contains).',
    example: 'Bab',
  })
  @IsOptional()
  @IsString()
  @Length(1, 60)
  search?: string;
}

class WilayaDto {
  @ApiProperty({ example: 16, description: 'Official wilaya code' })
  id!: number;
  @ApiProperty({ example: 'Alger' }) name_fr!: string;
  @ApiProperty({ example: 'الجزائر' }) name_ar!: string;
}

class CommuneDto extends WilayaDto {
  @ApiProperty({ example: 16 }) wilaya_id!: number;
}

const like = (s: string) => `%${s.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

@ApiTags('Geo (reference data)')
@Public()
@Controller('geo')
export class GeoController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get('wilayas')
  @ApiOperation({ summary: 'List the 58 wilayas (public)' })
  @ApiEnvelope(WilayaDto, { paginated: true })
  @ApiErrors()
  async wilayas(@Query() q: GeoQueryDto) {
    const where = q.search
      ? or(
          ilike(wilayas.nameFr, like(q.search)),
          ilike(wilayas.nameAr, like(q.search)),
        )
      : undefined;
    const col =
      q.sort === 'name_fr'
        ? wilayas.nameFr
        : q.sort === 'name_ar'
          ? wilayas.nameAr
          : wilayas.id;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(wilayas)
        .where(where)
        .orderBy(q.order === 'desc' ? desc(col) : asc(col))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      this.db.select({ total: count() }).from(wilayas).where(where),
    ]);
    return Paginated.of(
      rows.map((w) => ({ id: w.id, name_fr: w.nameFr, name_ar: w.nameAr })),
      total,
      q.page,
      q.limit,
    );
  }

  @Get('wilayas/:id/communes')
  @ApiOperation({ summary: 'List communes of a wilaya (public)' })
  @ApiEnvelope(CommuneDto, { paginated: true })
  @ApiErrors('NOT_FOUND')
  async communes(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: GeoQueryDto,
  ) {
    const [w] = await this.db
      .select({ id: wilayas.id })
      .from(wilayas)
      .where(eq(wilayas.id, id))
      .limit(1);
    if (!w) throw new AppException('NOT_FOUND');
    const conditions: SQL[] = [eq(communes.wilayaId, id)];
    if (q.search)
      conditions.push(
        or(
          ilike(communes.nameFr, like(q.search)),
          ilike(communes.nameAr, like(q.search)),
        ) as SQL,
      );
    const where = and(...conditions);
    const col =
      q.sort === 'name_fr'
        ? communes.nameFr
        : q.sort === 'name_ar'
          ? communes.nameAr
          : communes.id;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(communes)
        .where(where)
        .orderBy(q.order === 'desc' ? desc(col) : asc(col))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      this.db.select({ total: count() }).from(communes).where(where),
    ]);
    return Paginated.of(
      rows.map((c) => ({
        id: c.id,
        wilaya_id: c.wilayaId,
        name_fr: c.nameFr,
        name_ar: c.nameAr,
      })),
      total,
      q.page,
      q.limit,
    );
  }
}
