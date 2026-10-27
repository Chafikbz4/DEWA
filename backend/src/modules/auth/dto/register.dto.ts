import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  consentTypeEnum,
  languageEnum,
  vehicleTypeEnum,
} from '../../../database/schema';
import {
  IsPhone,
  IsStrongPassword,
} from '../../../common/validation/validators';

export class ConsentInputDto {
  @ApiProperty({ enum: consentTypeEnum.enumValues, example: 'TERMS' })
  @IsEnum(consentTypeEnum.enumValues)
  type!: (typeof consentTypeEnum.enumValues)[number];

  @ApiProperty({
    description:
      'Version of the document the user accepted. TERMS/PRIVACY must equal the current version (see docs).',
    example: '2026-10',
  })
  @IsString()
  @Length(1, 32)
  version!: string;
}

/** Shared identity fields. At least one of email / phone is required. */
export class BaseRegisterDto {
  @ApiPropertyOptional({
    description: 'At least one of email / phone is required.',
    example: 'amina@example.dz',
    maxLength: 254,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    description:
      'E.164 or Algerian local format (0550123456). At least one of email / phone is required. If both are given the OTP goes to the email.',
    example: '+213550123456',
  })
  @IsOptional()
  @IsPhone()
  phone?: string;

  @ApiProperty({
    description:
      '≥10 chars incl. upper-case, lower-case and a digit (max 128).',
    example: 'Str0ngPassw0rd',
  })
  @IsStrongPassword()
  password!: string;

  @ApiProperty({ example: 'Amina', maxLength: 100 })
  @IsString()
  @Length(1, 100)
  first_name!: string;

  @ApiProperty({ example: 'Benali', maxLength: 100 })
  @IsString()
  @Length(1, 100)
  last_name!: string;

  @ApiProperty({ enum: languageEnum.enumValues, example: 'fr' })
  @IsEnum(languageEnum.enumValues)
  preferred_language!: 'ar' | 'fr';

  @ApiProperty({
    type: [ConsentInputDto],
    description:
      'Must include TERMS and PRIVACY (current versions). Optional: HEALTH_DATA_PROCESSING, SHARE_PRESCRIPTION_WITH_PHARMACY.',
    example: [
      { type: 'TERMS', version: '2026-10' },
      { type: 'PRIVACY', version: '2026-10' },
    ],
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ConsentInputDto)
  consents!: ConsentInputDto[];
}

export class RegisterPatientDto extends BaseRegisterDto {}

export class PharmacyInfoDto {
  @ApiProperty({ example: 'Pharmacie El Amel', maxLength: 200 })
  @IsString()
  @Length(1, 200)
  name_fr!: string;

  @ApiProperty({ example: 'صيدلية الأمل', maxLength: 200 })
  @IsString()
  @Length(1, 200)
  name_ar!: string;

  @ApiPropertyOptional({ example: 'EURL Pharmacie El Amel', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legal_name?: string;

  @ApiProperty({
    description: 'Ministry of Health opening authorization number (unique).',
    example: 'AUT-16-2019-0457',
  })
  @IsString()
  @Length(3, 100)
  authorization_number!: string;

  @ApiPropertyOptional({ description: 'NIF', example: '000016001234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  tax_id_nif?: string;

  @ApiPropertyOptional({
    description: 'Registre de commerce',
    example: '16/00-1234567B19',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  commercial_register_rc?: string;

  @ApiProperty({
    description: 'Wilaya code (1-58). See /docs/01-database.md seeds.',
    example: 16,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(58)
  wilaya_id!: number;

  @ApiProperty({
    description: 'Commune id; must belong to wilaya_id.',
    example: 554,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  commune_id!: number;

  @ApiProperty({ example: '12 Rue Didouche Mourad', maxLength: 255 })
  @IsString()
  @Length(3, 255)
  address_line!: string;

  @ApiPropertyOptional({ example: 36.7538 })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 3.0588 })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Public pharmacy phone.',
    example: '+21321000000',
  })
  @IsOptional()
  @IsPhone()
  phone?: string;
}

export class RegisterPharmacyDto extends BaseRegisterDto {
  @ApiPropertyOptional({
    description: 'Owner pharmacist license number.',
    example: 'PH-16-00987',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pharmacist_license_number?: string;

  @ApiProperty({ type: PharmacyInfoDto })
  @ValidateNested()
  @Type(() => PharmacyInfoDto)
  pharmacy!: PharmacyInfoDto;
}

export class DeliveryCompanyInfoDto {
  @ApiProperty({ example: 'Yassir Express Alger', maxLength: 200 })
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiPropertyOptional({ example: 'SARL Express Alger', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legal_name?: string;

  @ApiPropertyOptional({ example: '000016009876543' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  tax_id?: string;

  @ApiPropertyOptional({ example: '16/00-7654321B20' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  rc_number?: string;

  @ApiPropertyOptional({ example: '+213560000000' })
  @IsOptional()
  @IsPhone()
  phone?: string;

  @ApiPropertyOptional({ example: 'contact@express.dz' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

export class RegisterDeliveryCompanyDto extends BaseRegisterDto {
  @ApiProperty({ type: DeliveryCompanyInfoDto })
  @ValidateNested()
  @Type(() => DeliveryCompanyInfoDto)
  company!: DeliveryCompanyInfoDto;
}

export class RegisterDriverDto extends BaseRegisterDto {
  @ApiProperty({ enum: vehicleTypeEnum.enumValues, example: 'MOTORCYCLE' })
  @IsEnum(vehicleTypeEnum.enumValues)
  vehicle_type!: (typeof vehicleTypeEnum.enumValues)[number];

  @ApiPropertyOptional({ example: '01234-116-16', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  plate_number?: string;

  @ApiPropertyOptional({
    description: 'Driving license number (stored encrypted).',
    example: 'DL-1600123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  license_number?: string;
}

export class RegisterStaffDto {
  @ApiProperty({ description: 'Invitation token received by SMS/email.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  invitation_token!: string;

  @ApiProperty({ example: 'Str0ngPassw0rd' })
  @IsStrongPassword()
  password!: string;

  @ApiProperty({ example: 'Karim' })
  @IsString()
  @Length(1, 100)
  first_name!: string;

  @ApiProperty({ example: 'Haddad' })
  @IsString()
  @Length(1, 100)
  last_name!: string;

  @ApiProperty({ enum: languageEnum.enumValues, example: 'ar' })
  @IsEnum(languageEnum.enumValues)
  preferred_language!: 'ar' | 'fr';

  @ApiPropertyOptional({
    description: 'Required for PHARMACIST invitations.',
    example: 'PH-16-01234',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pharmacist_license_number?: string;

  @ApiProperty({ type: [ConsentInputDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ConsentInputDto)
  consents!: ConsentInputDto[];
}

export class InvitationPreviewDto {
  @ApiProperty({ description: 'Invitation token received by SMS/email.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  invitation_token!: string;
}

export class InvitationPreviewResponseDto {
  @ApiProperty({ example: 'Pharmacie El Amel' }) pharmacy_name_fr!: string;
  @ApiProperty({ example: 'صيدلية الأمل' }) pharmacy_name_ar!: string;
  @ApiProperty({ enum: ['PHARMACIST', 'ASSISTANT'] }) staff_role!: string;
  @ApiProperty({ example: '+213*****4567' }) target_masked!: string;
  @ApiProperty() expires_at!: Date;
}

export const INVITABLE_STAFF_ROLES = ['PHARMACIST', 'ASSISTANT'] as const;

export class InviteStaffDto {
  @ApiPropertyOptional({
    description: 'At least one of email / phone.',
    example: 'karim@example.dz',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ example: '+213661234567' })
  @IsOptional()
  @IsPhone()
  phone?: string;

  @ApiProperty({ enum: INVITABLE_STAFF_ROLES, example: 'PHARMACIST' })
  @IsIn(INVITABLE_STAFF_ROLES)
  staff_role!: (typeof INVITABLE_STAFF_ROLES)[number];
}

export class InvitationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: INVITABLE_STAFF_ROLES }) staff_role!: string;
  @ApiProperty({ example: '+213*****4567' }) target_masked!: string;
  @ApiProperty({ enum: ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] })
  status!: string;
  @ApiProperty() expires_at!: Date;
  @ApiProperty() created_at!: Date;
}
