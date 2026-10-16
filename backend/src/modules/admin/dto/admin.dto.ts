import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
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
  ValidateIf,
} from 'class-validator';
import {
  ADMIN_SUB_ROLES,
  ALL_PERMISSIONS,
} from '../../../common/auth/permissions';
import { PaginationQueryDto } from '../../../common/http/pagination.dto';
import { medicineCategoryEnum } from '../../../database/schema';

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true'
    ? true
    : value === false || value === 'false'
      ? false
      : value;

export class ReasonDto {
  @ApiProperty({
    minLength: 5,
    maxLength: 1000,
    example: 'Documents frauduleux signalés par la DSP',
  })
  @IsString()
  @Length(5, 1000)
  reason!: string;
}

// ------------------------------------------------------------ access

export class SetRolePermissionsDto extends ReasonDto {
  @ApiProperty({ isArray: true, enum: ALL_PERMISSIONS })
  @IsArray()
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions!: string[];
}

export class SetAdminRolesDto extends ReasonDto {
  @ApiProperty({
    isArray: true,
    enum: ADMIN_SUB_ROLES,
    example: ['VERIFICATION_ADMIN'],
  })
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(ADMIN_SUB_ROLES, { each: true })
  roles!: (typeof ADMIN_SUB_ROLES)[number][];
}

// ------------------------------------------------------- verification

export class VerificationQueueDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Status filter (default: the pending status of the queue).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    default: 'asc',
    description: 'Oldest first by default.',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  override order: 'asc' | 'desc' = 'asc';
}

export class ApproveDto {
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RequestDocumentsDto extends ReasonDto {
  @ApiPropertyOptional({
    isArray: true,
    example: ['AUTHORIZATION'],
    description: 'Document types to resend (default: all pending ones).',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  doc_types?: string[];
}

// -------------------------------------------------------- monitoring

export class MonitoringQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  pharmacy_id?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(58)
  wilaya_id?: number;
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class SensitiveAccessDto {
  @ApiProperty({
    enum: ['REQUEST', 'CONVERSATION'],
    description:
      'REQUEST = prescription files, items and Chifa data of a request.',
  })
  @IsIn(['REQUEST', 'CONVERSATION'])
  resource_type!: 'REQUEST' | 'CONVERSATION';

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  resource_id!: string;

  @ApiProperty({
    minLength: 20,
    maxLength: 1000,
    example: 'Litige COMP-2026-000123 : vérifier la conformité de l’ordonnance',
  })
  @IsString()
  @Length(20, 1000)
  justification!: string;
}

export class GrantsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'All admins’ grants (requires audit.read).',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  all?: boolean;

  @ApiPropertyOptional({ description: 'Only active grants.' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  active?: boolean;
}

// -------------------------------------------------------------- users

export class SuspendUserDto extends ReasonDto {}

// --------------------------------------------------------- complaints

export class AdminComplaintsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED', 'ESCALATED'],
  })
  @IsOptional()
  @IsIn(['OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED', 'ESCALATED'])
  status?: string;

  @ApiPropertyOptional({ enum: ['PHARMACY', 'DRIVER', 'PATIENT', 'PLATFORM'] })
  @IsOptional()
  @IsIn(['PHARMACY', 'DRIVER', 'PATIENT', 'PLATFORM'])
  against_type?: string;

  @ApiPropertyOptional({ description: '"me" or an admin user id' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  assigned?: string;
}

export class AssignComplaintDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Default: yourself' })
  @IsOptional()
  @IsUUID()
  admin_user_id?: string;
}

export class ComplaintStatusDto extends ReasonDto {
  @ApiProperty({ enum: ['IN_REVIEW', 'ESCALATED', 'REJECTED'] })
  @IsIn(['IN_REVIEW', 'ESCALATED', 'REJECTED'])
  status!: 'IN_REVIEW' | 'ESCALATED' | 'REJECTED';
}

export class ComplaintNoteDto {
  @ApiProperty({ minLength: 1, maxLength: 4000 })
  @IsString()
  @Length(1, 4000)
  body!: string;
}

export class ResolveComplaintDto {
  @ApiProperty({ enum: ['NONE', 'REFUND', 'WARNING', 'SUSPENSION'] })
  @IsIn(['NONE', 'REFUND', 'WARNING', 'SUSPENSION'])
  outcome!: 'NONE' | 'REFUND' | 'WARNING' | 'SUSPENSION';

  @ApiProperty({ minLength: 5, maxLength: 2000 })
  @IsString()
  @Length(5, 2000)
  note!: string;

  @ApiPropertyOptional({
    description:
      'REFUND only: partial amount (default: everything refundable).',
  })
  @ValidateIf(
    (o: ResolveComplaintDto) =>
      o.outcome === 'REFUND' && o.refund_amount_centimes !== undefined,
  )
  @Type(() => Number)
  @IsInt()
  @Min(1)
  refund_amount_centimes?: number;
}

// ------------------------------------------------------------ delivery

export class ZonesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(58)
  wilaya_id?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  active?: boolean;
}

export class CreateZoneDto {
  @ApiProperty({ example: 16 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(58)
  wilaya_id!: number;
  @ApiPropertyOptional({ description: 'Omit for the whole wilaya' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  commune_id?: number;
}

export class UpdateZoneDto {
  @ApiProperty() @IsBoolean() is_active!: boolean;
}

export class FeeRulesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  zone_id?: string;
}

export class CreateFeeRuleDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() zone_id!: string;
  @ApiProperty({ example: 20000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  base_fee_centimes!: number;
  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  per_km_centimes?: number;
  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  min_fee_centimes?: number;
  @ApiPropertyOptional({ example: 80000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_fee_centimes?: number;
  @ApiPropertyOptional({ example: '2026-11-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  effective_from?: string;
}

export class UpdateFeeRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  base_fee_centimes?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  per_km_centimes?: number;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  min_fee_centimes?: number;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  max_fee_centimes?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
}

export class DeliverySettingsDto extends ReasonDto {
  @ApiPropertyOptional({ minimum: 5, maximum: 1440 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  delivery_assignment_timeout_minutes?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  delivery_max_releases_per_day?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 300 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  driver_location_min_interval_seconds?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  delivery_code_max_attempts?: number;
}

// ---------------------------------------------------------- commission

export class CommissionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  pharmacy_id?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  active?: boolean;
}

export class CreateCommissionDto {
  @ApiProperty({ enum: ['GLOBAL', 'PHARMACY'] })
  @IsIn(['GLOBAL', 'PHARMACY'])
  scope!: 'GLOBAL' | 'PHARMACY';
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  pharmacy_id?: string;
  @ApiProperty({
    enum: ['PERCENT', 'FIXED', 'SUBSCRIPTION'],
    description:
      'PERCENT in basis points (500 = 5 %); FIXED / SUBSCRIPTION in centimes.',
  })
  @IsIn(['PERCENT', 'FIXED', 'SUBSCRIPTION'])
  type!: 'PERCENT' | 'FIXED' | 'SUBSCRIPTION';
  @ApiProperty({ example: 500 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  value!: number;
  @ApiProperty({
    minLength: 10,
    maxLength: 2000,
    description: 'Required: reference of the legal / commercial review.',
  })
  @IsString()
  @Length(10, 2000)
  legal_review_note!: string;
}

export class UpdateCommissionDto extends ReasonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  value?: number;
  @ApiPropertyOptional({
    description:
      'Activating deactivates the other active rule of the same target.',
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(10, 2000)
  legal_review_note?: string;
}

// --------------------------------------------------------- eligibility

export class UpdatePolicyDto extends ReasonDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_enabled?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowed_online_request?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowed_online_payment?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowed_delivery?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requires_pharmacist_validation?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requires_original_prescription?: boolean;
  @ApiPropertyOptional({
    nullable: true,
    maxLength: 2000,
    description:
      'Required to enable a policy (always for CONTROLLED / PSYCHOTROPIC).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  legal_basis_reference?: string | null;
}

// ------------------------------------------------------------- catalog

export class AdminMedicinesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
  @ApiPropertyOptional({ enum: medicineCategoryEnum.enumValues })
  @IsOptional()
  @IsEnum(medicineCategoryEnum.enumValues)
  category?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  active?: boolean;
}

export class MedicineDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Length(1, 200)
  brand_name!: string;
  @ApiProperty({ enum: medicineCategoryEnum.enumValues })
  @IsEnum(medicineCategoryEnum.enumValues)
  category!: (typeof medicineCategoryEnum.enumValues)[number];
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name_ar?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  inn_dci?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  form?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  dosage?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pack_size?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  manufacturer?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requires_prescription?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() reimbursable_flag?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  regulatory_code?: string;
}

export class UpdateMedicineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 200)
  brand_name?: string;
  @ApiPropertyOptional({ enum: medicineCategoryEnum.enumValues })
  @IsOptional()
  @IsEnum(medicineCategoryEnum.enumValues)
  category?: (typeof medicineCategoryEnum.enumValues)[number];
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name_ar?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  inn_dci?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  form?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  dosage?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pack_size?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  manufacturer?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requires_prescription?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() reimbursable_flag?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  regulatory_code?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() is_active?: boolean;
}

export class ImportQueryDto {
  @ApiPropertyOptional({
    default: false,
    description: 'Validate only, write nothing.',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  dry_run?: boolean;
}

// ----------------------------------------------- analytics / audit / settings

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(58)
  wilaya_id?: number;
}

export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actor_user_id?: string;
  @ApiPropertyOptional({ example: 'USER_STATUS_CHANGED' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;
  @ApiPropertyOptional({ example: 'user' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  resource_type?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  resource_id?: string;
  @ApiPropertyOptional({ example: '2026-10-01' })
  @IsOptional()
  @IsDateString()
  from?: string;
  @ApiPropertyOptional({ example: '2026-10-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class UpdateSettingDto extends ReasonDto {
  @ApiProperty({
    description:
      'New value; must have the type of the default value (number ≥ 0, boolean, string, string[]).',
  })
  @IsDefined()
  value!: unknown;
}

export class TemplateDto extends ReasonDto {
  @ApiProperty({ maxLength: 200, example: 'Code de livraison' })
  @IsString()
  @Length(1, 200)
  title!: string;
  @ApiProperty({
    maxLength: 1000,
    example: 'Votre code pour la commande {reference} : {code}.',
  })
  @IsString()
  @Length(1, 1000)
  body!: string;
}
