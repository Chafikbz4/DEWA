import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
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
} from 'class-validator';
import { IsPhone } from '../../../common/validation/validators';
import {
  dependantAuthorizationEnum,
  genderEnum,
  languageEnum,
  relationshipEnum,
} from '../../../database/schema';

// ---------------------------------------------------------------- profile

export class UpdatePatientProfileDto {
  @ApiPropertyOptional({ example: 'Amina', maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  first_name?: string;

  @ApiPropertyOptional({ example: 'Benali', maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  last_name?: string;

  @ApiPropertyOptional({
    example: '1990-04-21',
    description: 'ISO date (YYYY-MM-DD), in the past.',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_of_birth?: string;

  @ApiPropertyOptional({ enum: genderEnum.enumValues })
  @IsOptional()
  @IsEnum(genderEnum.enumValues)
  gender?: 'MALE' | 'FEMALE';

  @ApiPropertyOptional({
    description:
      'Optional national identification number (NIN). Stored encrypted; only a masked value is ever returned.',
    example: '109900123456789012',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9A-Za-z]{6,30}$/)
  national_id?: string;

  @ApiPropertyOptional({ enum: languageEnum.enumValues })
  @IsOptional()
  @IsEnum(languageEnum.enumValues)
  preferred_language?: 'ar' | 'fr';
}

export class PatientProfileDto {
  @ApiProperty({ format: 'uuid' }) user_id!: string;
  @ApiProperty({ example: 'Amina' }) first_name!: string;
  @ApiProperty({ example: 'Benali' }) last_name!: string;
  @ApiPropertyOptional({ nullable: true, example: '1990-04-21' })
  date_of_birth!: string | null;
  @ApiPropertyOptional({ nullable: true, enum: genderEnum.enumValues })
  gender!: string | null;
  @ApiPropertyOptional({ nullable: true, example: '**************9012' })
  national_id_masked!: string | null;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiProperty({ enum: languageEnum.enumValues }) preferred_language!: string;
  @ApiProperty() updated_at!: Date;
}

// -------------------------------------------------------------- addresses

export class CreateAddressDto {
  @ApiPropertyOptional({ example: 'Maison', maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @ApiProperty({ example: 16, minimum: 1, maximum: 58 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(58)
  wilaya_id!: number;

  @ApiProperty({
    example: 554,
    description: 'Must belong to wilaya_id (GET /geo/wilayas/:id/communes).',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  commune_id!: number;

  @ApiProperty({ example: '12 Rue Didouche Mourad', maxLength: 255 })
  @IsString()
  @Length(3, 255)
  street_line!: string;

  @ApiPropertyOptional({
    example: 'Bât. B, 3e étage, porte gauche',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  building_details?: string;

  @ApiPropertyOptional({ example: 36.7538 })
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ example: 3.0588 })
  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({
    example: '+213661234567',
    description: 'Contact phone for delivery (E.164 or local).',
  })
  @IsOptional()
  @IsPhone()
  phone_contact?: string;

  @ApiPropertyOptional({ example: 'Sonner deux fois', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  delivery_notes?: string;

  @ApiPropertyOptional({
    description:
      'Make this the default address. The first address is always default.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}

export class AddressDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiPropertyOptional({ nullable: true }) label!: string | null;
  @ApiProperty({ example: 16 }) wilaya_id!: number;
  @ApiProperty({ example: 'Alger' }) wilaya_name_fr!: string;
  @ApiProperty({ example: 'الجزائر' }) wilaya_name_ar!: string;
  @ApiProperty({ example: 554 }) commune_id!: number;
  @ApiProperty({ example: 'Alger Centre' }) commune_name_fr!: string;
  @ApiProperty({ example: 'الجزائر الوسطى' }) commune_name_ar!: string;
  @ApiProperty() street_line!: string;
  @ApiPropertyOptional({ nullable: true }) building_details!: string | null;
  @ApiPropertyOptional({ nullable: true }) latitude!: number | null;
  @ApiPropertyOptional({ nullable: true }) longitude!: number | null;
  @ApiPropertyOptional({ nullable: true }) phone_contact!: string | null;
  @ApiPropertyOptional({ nullable: true }) delivery_notes!: string | null;
  @ApiProperty() is_default!: boolean;
  @ApiProperty() created_at!: Date;
  @ApiProperty() updated_at!: Date;
}

// ------------------------------------------------------------- dependants

export class CreateDependantDto {
  @ApiProperty({ example: 'Yanis', maxLength: 100 })
  @IsString()
  @Length(1, 100)
  first_name!: string;

  @ApiProperty({ example: 'Benali', maxLength: 100 })
  @IsString()
  @Length(1, 100)
  last_name!: string;

  @ApiPropertyOptional({ example: '2018-09-02' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_of_birth?: string;

  @ApiProperty({ enum: relationshipEnum.enumValues, example: 'CHILD' })
  @IsEnum(relationshipEnum.enumValues)
  relationship!: (typeof relationshipEnum.enumValues)[number];

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Proof document (file uploaded with purpose DEPENDANT_PROOF, e.g. livret de famille). Lets an admin verify the link.',
  })
  @IsOptional()
  @IsUUID()
  proof_file_id?: string;
}

export class UpdateDependantDto extends PartialType(CreateDependantDto) {}

export class DependantDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() first_name!: string;
  @ApiProperty() last_name!: string;
  @ApiPropertyOptional({ nullable: true }) date_of_birth!: string | null;
  @ApiProperty({ enum: relationshipEnum.enumValues }) relationship!: string;
  @ApiProperty({
    enum: dependantAuthorizationEnum.enumValues,
    description:
      'DECLARED (patient statement) → VERIFIED / REJECTED by an admin after reviewing the proof.',
  })
  authorization_status!: string;
  @ApiPropertyOptional({ nullable: true, format: 'uuid' }) proof_file_id!:
    string | null;
  @ApiProperty({
    description:
      'Whether requests can currently be created for this dependant.',
  })
  can_request_for!: boolean;
  @ApiProperty() created_at!: Date;
}
