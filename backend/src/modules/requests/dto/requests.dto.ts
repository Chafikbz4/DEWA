import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto';
import {
  chifaVerificationStatusEnum,
  fileQualityStatusEnum,
  fulfillmentTypeEnum,
  paymentMethodEnum,
  recipientStatusEnum,
  requestFulfillmentStatusEnum,
  requestItemSourceEnum,
  requestStatusEnum,
  requestTypeEnum,
  requestUrgencyEnum,
} from '../../../database/schema';

export class RequestItemInputDto {
  @ApiProperty({ example: 'Doliprane 1000mg', maxLength: 255 })
  @IsString()
  @Length(1, 255)
  raw_name!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Catalog medicine (GET /medicines/search). Required for PRODUCT requests.',
  })
  @IsOptional()
  @IsUUID()
  medicine_id?: string;

  @ApiPropertyOptional({ example: 2, minimum: 1, maximum: 100, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;

  @ApiPropertyOptional({ example: '1 comprimé matin et soir', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  dosage_text?: string;
}

export class MatchingPreviewDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'One of my saved addresses (location used for matching / delivery).',
  })
  @IsUUID()
  address_id!: string;

  @ApiProperty({
    example: false,
    description: 'true = home delivery, false = pickup at the pharmacy.',
  })
  @IsBoolean()
  delivery_wanted!: boolean;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Pharmacies chosen by the patient. Omit to let the platform match automatically.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  pharmacy_ids?: string[];
}

export class CreateRequestDto extends MatchingPreviewDto {
  @ApiProperty({ enum: requestTypeEnum.enumValues, example: 'PRESCRIPTION' })
  @IsEnum(requestTypeEnum.enumValues)
  request_type!: 'PRESCRIPTION' | 'CHIFA' | 'PRODUCT';

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Prescription pages (files uploaded with purpose PRESCRIPTION), in page order. Required for PRESCRIPTION and CHIFA (1–10).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  file_ids?: string[];

  @ApiPropertyOptional({
    maxLength: 1000,
    example: 'Je préfère le générique si disponible.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  patient_note?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Submit on behalf of one of my dependants.',
  })
  @IsOptional()
  @IsUUID()
  dependant_id?: string;

  @ApiProperty({
    example: true,
    description:
      'MUST be true: the patient agrees to share the prescription with the recipient pharmacies (recorded as a consent).',
  })
  @IsBoolean()
  consent_to_share!: boolean;

  @ApiPropertyOptional({
    enum: requestUrgencyEnum.enumValues,
    default: 'NORMAL',
  })
  @IsOptional()
  @IsEnum(requestUrgencyEnum.enumValues)
  urgency?: 'NORMAL' | 'URGENT';

  @ApiPropertyOptional({
    type: [RequestItemInputDto],
    description:
      'Items typed by the patient (optional; required for PRODUCT, max 30).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RequestItemInputDto)
  items?: RequestItemInputDto[];

  // --- CHIFA only ---
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'CHIFA only: photo of the card (purpose CHIFA_CARD).',
  })
  @IsOptional()
  @IsUUID()
  card_file_id?: string;

  @ApiPropertyOptional({
    description: 'CHIFA only: social insurance number (stored encrypted).',
    example: '123456789012',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9A-Za-z -]{6,30}$/)
  insurance_number?: string;

  @ApiPropertyOptional({
    description: 'CHIFA only: card holder name.',
    example: 'Benali Amina',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @Length(2, 200)
  holder_name?: string;
}

export class CancelRequestDto {
  @ApiPropertyOptional({ maxLength: 500, example: 'Trouvé en pharmacie' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateRequestItemDto extends PartialType(RequestItemInputDto) {}

export class RequestsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Comma-separated statuses',
    example: 'AWAITING_PHARMACY_RESPONSE,OFFER_AVAILABLE',
  })
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
  @IsIn(requestStatusEnum.enumValues, { each: true })
  status?: (typeof requestStatusEnum.enumValues)[number][];

  @ApiPropertyOptional({ enum: requestTypeEnum.enumValues })
  @IsOptional()
  @IsEnum(requestTypeEnum.enumValues)
  request_type?: (typeof requestTypeEnum.enumValues)[number];

  @ApiPropertyOptional({
    description: 'Created at or after (ISO date-time)',
    example: '2026-10-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Created before (ISO date-time)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: ['created_at', 'expires_at'],
    default: 'created_at',
  })
  @IsOptional()
  @IsIn(['created_at', 'expires_at'])
  sort?: 'created_at' | 'expires_at';
}

// ------------------------------------------------------------------ outputs

export class MatchedPharmacyDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name_fr!: string;
  @ApiProperty() name_ar!: string;
  @ApiProperty() address_line!: string;
  @ApiProperty() commune_name_fr!: string;
  @ApiProperty() commune_name_ar!: string;
  @ApiProperty() wilaya_name_fr!: string;
  @ApiPropertyOptional({ nullable: true, example: 650 }) distance_m!:
    number | null;
  @ApiProperty() open_now!: boolean;
  @ApiProperty() delivery_available!: boolean;
}

export class MatchingPreviewResponseDto {
  @ApiProperty({ type: [MatchedPharmacyDto] })
  pharmacies!: MatchedPharmacyDto[];
  @ApiProperty({ example: 5 }) max_pharmacies!: number;
  @ApiProperty({ enum: ['PATIENT_CHOICE', 'AUTOMATIC'] }) mode!: string;
}

export class CoverageDto {
  @ApiProperty({
    example: false,
    description:
      'true ONLY when an official CNAS integration confirmed coverage.',
  })
  verified!: boolean;
  @ApiPropertyOptional({
    nullable: true,
    example: null,
    description: 'e.g. CNAS_API when verified',
  })
  source!: string | null;
  @ApiProperty({ enum: chifaVerificationStatusEnum.enumValues })
  status!: string;
}

export class RequestCheckoutDto {
  @ApiProperty({
    enum: fulfillmentTypeEnum.enumValues,
    description: 'How the patient wants to receive the order',
  })
  @IsEnum(fulfillmentTypeEnum.enumValues)
  fulfillment_type!: 'DELIVERY' | 'PICKUP';

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Chosen delivery company. Omit or null to let DEWA assign the nearest verified partner.',
  })
  @IsOptional()
  @IsUUID()
  delivery_company_id?: string | null;

  @ApiProperty({
    enum: paymentMethodEnum.enumValues,
    description:
      'ON_DELIVERY, CCP or BARIDIMOB. Online methods are saved without charging.',
  })
  @IsEnum(paymentMethodEnum.enumValues)
  payment_method!: 'ON_DELIVERY' | 'CCP' | 'BARIDIMOB';
}

export class RequestFileDto {
  @ApiProperty({ format: 'uuid' }) file_id!: string;
  @ApiProperty({ example: 1 }) page_order!: number;
  @ApiProperty({ enum: fileQualityStatusEnum.enumValues })
  quality_status!: string;
}

export class RequestItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() raw_name!: string;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) medicine_id!:
    string | null;
  @ApiProperty() quantity!: number;
  @ApiPropertyOptional({ nullable: true }) dosage_text!: string | null;
  @ApiProperty({
    enum: requestItemSourceEnum.enumValues,
    description: 'OCR items are suggestions only.',
  })
  source!: string;
  @ApiPropertyOptional({ nullable: true, example: 0.62 }) ocr_confidence!:
    number | null;
  @ApiProperty() confirmed_by_pharmacist!: boolean;
}

export class RecipientDto {
  @ApiProperty({ format: 'uuid' }) pharmacy_id!: string;
  @ApiProperty() pharmacy_name_fr!: string;
  @ApiProperty() pharmacy_name_ar!: string;
  @ApiProperty({ enum: recipientStatusEnum.enumValues }) status!: string;
  @ApiProperty() sent_at!: Date;
  @ApiPropertyOptional({ nullable: true }) viewed_at!: Date | null;
  @ApiPropertyOptional({ nullable: true }) responded_at!: Date | null;
  @ApiPropertyOptional({
    nullable: true,
    example: 185000,
    description: 'Amount the patient must pay, quoted on acceptance (centimes)',
  })
  quoted_amount_centimes!: number | null;
  @ApiPropertyOptional({
    nullable: true,
    enum: fulfillmentTypeEnum.enumValues,
  })
  fulfillment_type!: string | null;
  @ApiPropertyOptional({ nullable: true })
  delivery_company_name!: string | null;
  @ApiPropertyOptional({ nullable: true, enum: paymentMethodEnum.enumValues })
  payment_method!: string | null;
  @ApiPropertyOptional({ nullable: true })
  payment_status!: string | null;
  @ApiPropertyOptional({ nullable: true })
  paid_at!: Date | null;
  @ApiPropertyOptional({ nullable: true })
  checkout_completed_at!: Date | null;
  @ApiPropertyOptional({
    nullable: true,
    enum: requestFulfillmentStatusEnum.enumValues,
  })
  fulfillment_status!: string | null;
  @ApiPropertyOptional({ nullable: true })
  fulfillment_updated_at!: Date | null;
}

export class OffersSummaryDto {
  @ApiProperty({ example: 2 }) count!: number;
  @ApiPropertyOptional({
    nullable: true,
    example: 185000,
    description: 'Lowest total among sent offers (centimes)',
  })
  best_total_centimes!: number | null;
  @ApiProperty({ type: [String] }) offer_ids!: string[];
}

export class RequestSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'RX-2026-000123' }) reference!: string;
  @ApiProperty({ enum: requestTypeEnum.enumValues }) request_type!: string;
  @ApiProperty({ enum: requestStatusEnum.enumValues }) status!: string;
  @ApiProperty({ enum: requestUrgencyEnum.enumValues }) urgency!: string;
  @ApiProperty() delivery_wanted!: boolean;
  @ApiPropertyOptional({ nullable: true }) dependant_first_name!: string | null;
  @ApiPropertyOptional({ nullable: true })
  wilaya_name_fr!: string | null;
  @ApiPropertyOptional({ nullable: true })
  wilaya_name_ar!: string | null;
  @ApiPropertyOptional({ nullable: true })
  commune_name_fr!: string | null;
  @ApiPropertyOptional({ nullable: true })
  commune_name_ar!: string | null;
  @ApiProperty() recipients_count!: number;
  @ApiProperty() offers_count!: number;
  @ApiPropertyOptional({
    nullable: true,
    example: 185000,
    description:
      'Amount to pay quoted by the pharmacy that accepted the request (centimes)',
  })
  accepted_amount_centimes!: number | null;
  @ApiPropertyOptional({ nullable: true })
  accepted_pharmacy_name_fr!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    enum: fulfillmentTypeEnum.enumValues,
  })
  fulfillment_type!: string | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' })
  delivery_company_id!: string | null;
  @ApiPropertyOptional({ nullable: true })
  delivery_company_name!: string | null;
  @ApiPropertyOptional({ nullable: true, enum: paymentMethodEnum.enumValues })
  payment_method!: string | null;
  @ApiPropertyOptional({ nullable: true })
  payment_status!: string | null;
  @ApiPropertyOptional({ nullable: true })
  paid_at!: Date | null;
  @ApiPropertyOptional({ nullable: true })
  checkout_completed_at!: Date | null;
  @ApiPropertyOptional({
    nullable: true,
    enum: requestFulfillmentStatusEnum.enumValues,
  })
  fulfillment_status!: string | null;
  @ApiPropertyOptional({ nullable: true })
  fulfillment_updated_at!: Date | null;
  @ApiPropertyOptional({ nullable: true }) expires_at!: Date | null;
  @ApiProperty() created_at!: Date;
}

export class RequestDetailDto extends RequestSummaryDto {
  @ApiPropertyOptional({ nullable: true }) patient_note!: string | null;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Frozen copy of the address at submission',
  })
  delivery_address!: Record<string, unknown> | null;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) dependant_id!:
    string | null;
  @ApiProperty({ description: 'A prescription document was attached' })
  prescription_submitted!: boolean;
  @ApiProperty({
    description: 'CHIFA card data was submitted (NOT the same as verified)',
  })
  chifa_info_submitted!: boolean;
  @ApiProperty({ type: CoverageDto }) coverage_verified!: CoverageDto;
  @ApiProperty({ type: [RequestFileDto] }) files!: RequestFileDto[];
  @ApiProperty({ type: [RequestItemDto] }) items!: RequestItemDto[];
  @ApiProperty({ type: [RecipientDto] }) recipients!: RecipientDto[];
  @ApiProperty({ type: OffersSummaryDto }) offers_summary!: OffersSummaryDto;
  @ApiPropertyOptional({ nullable: true }) cancelled_at!: Date | null;
  @ApiPropertyOptional({ nullable: true }) cancel_reason!: string | null;
  @ApiProperty() updated_at!: Date;
}
