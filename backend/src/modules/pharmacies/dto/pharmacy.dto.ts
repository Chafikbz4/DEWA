import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
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
import { IsPhone } from '../../../common/validation/validators';
import {
  documentReviewStatusEnum,
  payoutAccountTypeEnum,
  pharmacyDocTypeEnum,
  pharmacyStatusEnum,
  staffRoleEnum,
} from '../../../database/schema';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdatePharmacyDto {
  @ApiPropertyOptional({ example: 'Pharmacie El Amel' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name_fr?: string;
  @ApiPropertyOptional({ example: 'صيدلية الأمل' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name_ar?: string;
  @ApiPropertyOptional({ description: 'Locked once VERIFIED' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legal_name?: string;
  @ApiPropertyOptional({ description: 'Locked once VERIFIED' })
  @IsOptional()
  @IsString()
  @Length(3, 100)
  authorization_number?: string;
  @ApiPropertyOptional({ description: 'Locked once VERIFIED' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  tax_id_nif?: string;
  @ApiPropertyOptional({ description: 'Locked once VERIFIED' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  commercial_register_rc?: string;
  @ApiPropertyOptional({ example: 16 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(58)
  wilaya_id?: number;
  @ApiPropertyOptional({ example: 554 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  commune_id?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(3, 255)
  address_line?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: number;
  @ApiPropertyOptional({ example: '+21321000000' })
  @IsOptional()
  @IsPhone()
  phone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
  @ApiPropertyOptional({ description: 'Offer home delivery' })
  @IsOptional()
  @IsBoolean()
  delivery_available?: boolean;
  @ApiPropertyOptional({ description: 'Receive new requests (pause toggle)' })
  @IsOptional()
  @IsBoolean()
  accepts_requests?: boolean;
}

export class PharmacyMeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name_fr!: string;
  @ApiProperty() name_ar!: string;
  @ApiPropertyOptional({ nullable: true }) legal_name!: string | null;
  @ApiPropertyOptional({ nullable: true }) authorization_number!: string | null;
  @ApiPropertyOptional({ nullable: true }) tax_id_nif!: string | null;
  @ApiPropertyOptional({ nullable: true }) commercial_register_rc!:
    string | null;
  @ApiProperty() wilaya_id!: number;
  @ApiProperty() commune_id!: number;
  @ApiProperty() address_line!: string;
  @ApiPropertyOptional({ nullable: true }) latitude!: number | null;
  @ApiPropertyOptional({ nullable: true }) longitude!: number | null;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiProperty({ enum: pharmacyStatusEnum.enumValues }) status!: string;
  @ApiPropertyOptional({ nullable: true }) rejection_reason!: string | null;
  @ApiPropertyOptional({ nullable: true })
  submitted_for_review_at!: Date | null;
  @ApiPropertyOptional({ nullable: true }) verified_at!: Date | null;
  @ApiProperty() accepts_requests!: boolean;
  @ApiProperty() delivery_available!: boolean;
  @ApiPropertyOptional({ nullable: true }) avg_response_minutes!: number | null;
  @ApiProperty({
    enum: staffRoleEnum.enumValues,
    description: 'Your role in this pharmacy',
  })
  my_staff_role!: string;
  @ApiProperty() updated_at!: Date;
}

export class OpeningDayDto {
  @ApiProperty({
    minimum: 0,
    maximum: 6,
    description: '0 = Sunday … 6 = Saturday',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  day_of_week!: number;
  @ApiProperty({ default: false })
  @IsBoolean()
  is_closed!: boolean;
  @ApiProperty({ default: false, description: 'Open around the clock' })
  @IsBoolean()
  is_24h!: boolean;
  @ApiPropertyOptional({
    example: '08:00',
    description: 'HH:MM, required unless closed / 24h',
  })
  @IsOptional()
  @Matches(TIME)
  open_time?: string;
  @ApiPropertyOptional({
    example: '20:00',
    description: 'HH:MM; may be earlier than open_time for overnight hours',
  })
  @IsOptional()
  @Matches(TIME)
  close_time?: string;
}

export class PutOpeningHoursDto {
  @ApiProperty({
    type: [OpeningDayDto],
    description: 'Full week; days not listed are removed (= unknown/closed).',
  })
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => OpeningDayDto)
  days!: OpeningDayDto[];
}

export class OnDutyDto {
  @ApiProperty({ example: '2026-10-20T20:00:00Z' })
  @IsDateString()
  date_from!: string;
  @ApiProperty({ example: '2026-10-21T08:00:00Z' })
  @IsDateString()
  date_to!: string;
}

export class ServiceAreaDto {
  @ApiProperty({ example: 16 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(58)
  wilaya_id!: number;
  @ApiPropertyOptional({ example: 554, description: 'Omit = whole wilaya' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  commune_id?: number;
  @ApiPropertyOptional({
    example: 5,
    description: 'Limit to N km around the pharmacy',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  max_radius_km?: number;
}

export class PayoutAccountDto {
  @ApiProperty({ enum: payoutAccountTypeEnum.enumValues })
  @IsEnum(payoutAccountTypeEnum.enumValues)
  account_type!: 'BANK' | 'CCP';
  @ApiProperty({ example: 'EURL Pharmacie El Amel' })
  @IsString()
  @Length(2, 200)
  holder_name!: string;
  @ApiProperty({
    description:
      'RIB (20 digits) or CCP number + key. Stored encrypted, returned masked.',
    example: '00799999001234567890',
  })
  @IsString()
  @Matches(/^[0-9 ]{8,30}$/)
  account_number!: string;
}

export class AddDocumentDto {
  @ApiProperty({ enum: pharmacyDocTypeEnum.enumValues })
  @IsEnum(pharmacyDocTypeEnum.enumValues)
  doc_type!: (typeof pharmacyDocTypeEnum.enumValues)[number];
  @ApiProperty({
    format: 'uuid',
    description: 'File uploaded with purpose PHARMACY_DOC',
  })
  @IsUUID()
  file_id!: string;
}

export class DocumentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: pharmacyDocTypeEnum.enumValues }) doc_type!: string;
  @ApiProperty({ format: 'uuid' }) file_id!: string;
  @ApiProperty({ enum: documentReviewStatusEnum.enumValues })
  review_status!: string;
  @ApiPropertyOptional({
    nullable: true,
    description: 'Admin note (e.g. reason for rejection)',
  })
  review_note!: string | null;
  @ApiPropertyOptional({ nullable: true }) reviewed_at!: Date | null;
  @ApiProperty() created_at!: Date;
}

export class VerificationStatusDto {
  @ApiProperty({ enum: pharmacyStatusEnum.enumValues }) status!: string;
  @ApiPropertyOptional({ nullable: true }) rejection_reason!: string | null;
  @ApiPropertyOptional({ nullable: true })
  submitted_for_review_at!: Date | null;
  @ApiPropertyOptional({ nullable: true }) verified_at!: Date | null;
  @ApiProperty({
    type: [String],
    description: 'Required document types not yet provided (or rejected)',
  })
  missing_documents!: string[];
  @ApiProperty({ type: [DocumentDto] }) documents!: DocumentDto[];
  @ApiProperty({
    description:
      'Whether POST /pharmacy/verification/submit is currently possible',
  })
  can_submit!: boolean;
}

export class UpdateStaffDto {
  @ApiPropertyOptional({ enum: ['PHARMACIST', 'ASSISTANT'] })
  @IsOptional()
  @IsIn(['PHARMACIST', 'ASSISTANT'])
  staff_role?: 'PHARMACIST' | 'ASSISTANT';
  @ApiPropertyOptional({
    description: 'false = deactivate (access removed, sessions revoked)',
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
  @ApiPropertyOptional({ example: 'PH-16-01234' })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  pharmacist_license_number?: string;
}

export class StaffMemberDto {
  @ApiProperty({ format: 'uuid', description: 'pharmacy_staff id' })
  id!: string;
  @ApiProperty({ format: 'uuid' }) user_id!: string;
  @ApiPropertyOptional({ nullable: true }) first_name!: string | null;
  @ApiPropertyOptional({ nullable: true }) last_name!: string | null;
  @ApiProperty({ enum: staffRoleEnum.enumValues }) staff_role!: string;
  @ApiProperty() is_active!: boolean;
  @ApiPropertyOptional({ nullable: true }) pharmacist_license_number!:
    string | null;
  @ApiProperty({ description: 'Account status (admin approval)' })
  account_status!: string;
  @ApiProperty() joined_at!: Date;
}
