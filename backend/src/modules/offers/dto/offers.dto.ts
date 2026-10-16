import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto';
import {
  itemAvailabilityEnum,
  offerStatusEnum,
  patientApprovalEnum,
} from '../../../database/schema';

export class OfferItemInputDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Request item this line answers (from the request detail).',
  })
  @IsOptional()
  @IsUUID()
  request_item_id?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Catalog medicine supplied. Restricted categories are refused.',
  })
  @IsOptional()
  @IsUUID()
  medicine_id?: string;

  @ApiProperty({ example: 'Doliprane 1000mg boîte de 8', maxLength: 255 })
  @IsString()
  @Length(1, 255)
  name!: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'Defaults to the request item quantity (or quantity_offered).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  quantity_requested?: number;

  @ApiProperty({
    example: 2,
    minimum: 0,
    description: 'Forced to 0 when availability = UNAVAILABLE.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  quantity_offered!: number;

  @ApiProperty({
    example: 25000,
    description:
      'Unit price in centimes (25000 = 250,00 DA). Line total is computed by the server.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  unit_price_centimes!: number;

  @ApiProperty({ enum: itemAvailabilityEnum.enumValues })
  @IsEnum(itemAvailabilityEnum.enumValues)
  availability!: (typeof itemAvailabilityEnum.enumValues)[number];

  @ApiPropertyOptional({
    default: false,
    description:
      'Substitution – only OWNER/PHARMACIST; patient must approve it.',
  })
  @IsOptional()
  @IsBoolean()
  is_alternative?: boolean;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Required when is_alternative',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  alternative_reason?: string;
}

export class CreateOfferDto {
  @ApiProperty({ type: [OfferItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OfferItemInputDto)
  items!: OfferItemInputDto[];

  @ApiPropertyOptional({
    example: 30,
    description: 'Minutes to prepare the order',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10080)
  preparation_minutes?: number;

  @ApiPropertyOptional({
    description: 'Default: now + offer_validity_hours (12 h)',
  })
  @IsOptional()
  @IsDateString()
  valid_until?: string;

  @ApiProperty({
    example: false,
    description:
      'Offer home delivery (request must want it and the pharmacy must deliver). Fee computed by the server.',
  })
  @IsBoolean()
  delivery_available!: boolean;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'The patient must bring the original prescription at hand-over.',
  })
  @IsOptional()
  @IsBoolean()
  requires_prescription_original?: boolean;
}

export class PharmacyOffersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Comma-separated offer statuses' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @IsIn(offerStatusEnum.enumValues, { each: true })
  status?: (typeof offerStatusEnum.enumValues)[number][];
}

export class ItemApprovalDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';
}

export class OfferItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) request_item_id!:
    string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) medicine_id!:
    string | null;
  @ApiProperty() name!: string;
  @ApiProperty() quantity_requested!: number;
  @ApiProperty() quantity_offered!: number;
  @ApiProperty() unit_price_centimes!: number;
  @ApiProperty() line_total_centimes!: number;
  @ApiProperty({ enum: itemAvailabilityEnum.enumValues }) availability!: string;
  @ApiProperty() is_alternative!: boolean;
  @ApiPropertyOptional({ nullable: true }) alternative_reason!: string | null;
  @ApiProperty({ enum: patientApprovalEnum.enumValues })
  patient_approval!: string;
}

export class OfferDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) request_id!: string;
  @ApiProperty() pharmacy!: { id: string; name_fr: string; name_ar: string };
  @ApiProperty({ enum: offerStatusEnum.enumValues }) status!: string;
  @ApiProperty({ type: [OfferItemDto] }) items!: OfferItemDto[];
  @ApiProperty() items_subtotal_centimes!: number;
  @ApiProperty() delivery_fee_centimes!: number;
  @ApiProperty() service_fee_centimes!: number;
  @ApiProperty() total_centimes!: number;
  @ApiProperty({
    description: 'Total after excluding alternatives the patient REJECTED',
  })
  effective_total_centimes!: number;
  @ApiProperty() alternatives_pending!: number;
  @ApiPropertyOptional({ nullable: true }) preparation_minutes!: number | null;
  @ApiPropertyOptional({ nullable: true }) valid_until!: Date | null;
  @ApiProperty() delivery_available!: boolean;
  @ApiPropertyOptional({ nullable: true }) pharmacy_note!: string | null;
  @ApiProperty() requires_prescription_original!: boolean;
  @ApiPropertyOptional({ nullable: true }) sent_at!: Date | null;
  @ApiProperty() created_at!: Date;
}
