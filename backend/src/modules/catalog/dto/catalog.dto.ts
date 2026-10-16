import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto';
import {
  medicineCategoryEnum,
  stockStatusEnum,
} from '../../../database/schema';

export class MedicineSearchQueryDto extends PaginationQueryDto {
  @ApiProperty({
    description:
      'Search text: brand name (fr), Arabic name or DCI. Typo-tolerant.',
    example: 'doliprane',
  })
  @IsString()
  @Length(2, 100)
  q!: string;

  @ApiPropertyOptional({ enum: medicineCategoryEnum.enumValues })
  @IsOptional()
  @IsEnum(medicineCategoryEnum.enumValues)
  category?: (typeof medicineCategoryEnum.enumValues)[number];
}

export class MedicineDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Doliprane 1000mg' }) brand_name!: string;
  @ApiPropertyOptional({ nullable: true, example: 'دوليبران' }) name_ar!:
    string | null;
  @ApiPropertyOptional({ nullable: true, example: 'paracetamol' }) inn_dci!:
    string | null;
  @ApiPropertyOptional({ nullable: true, example: 'comprimé' }) form!:
    string | null;
  @ApiPropertyOptional({ nullable: true, example: '1000 mg' }) dosage!:
    string | null;
  @ApiPropertyOptional({ nullable: true, example: 'boîte de 8' }) pack_size!:
    string | null;
  @ApiPropertyOptional({ nullable: true }) manufacturer!: string | null;
  @ApiProperty({ enum: medicineCategoryEnum.enumValues }) category!: string;
  @ApiProperty() requires_prescription!: boolean;
  @ApiProperty({
    description: 'Informational only – never a reimbursement decision',
  })
  reimbursable_flag!: boolean;
  @ApiPropertyOptional({ nullable: true }) regulatory_code!: string | null;
}

export class StockQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: stockStatusEnum.enumValues })
  @IsOptional()
  @IsEnum(stockStatusEnum.enumValues)
  stock_status?: (typeof stockStatusEnum.enumValues)[number];

  @ApiPropertyOptional({ description: 'Filter by medicine name / DCI' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  q?: string;

  @ApiPropertyOptional({
    enum: ['updated_at', 'brand_name'],
    default: 'updated_at',
  })
  @IsOptional()
  @IsIn(['updated_at', 'brand_name'])
  sort?: 'updated_at' | 'brand_name';
}

export class PutStockDto {
  @ApiProperty({ enum: stockStatusEnum.enumValues, example: 'IN_STOCK' })
  @IsEnum(stockStatusEnum.enumValues)
  stock_status!: (typeof stockStatusEnum.enumValues)[number];

  @ApiPropertyOptional({ example: 24, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantity?: number;

  @ApiPropertyOptional({
    example: 25000,
    description: 'Unit price in centimes of DZD (25000 = 250,00 DA)',
    nullable: true,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  unit_price_centimes?: number;
}

export class StockImportQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description: 'Validate only, write nothing',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  dry_run?: boolean;
}
