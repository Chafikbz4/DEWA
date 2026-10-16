import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto';
import { IsPhone } from '../../../common/validation/validators';
import {
  deliveryCompanyDocTypeEnum,
  deliveryStatusEnum,
  driverDocTypeEnum,
  vehicleTypeEnum,
} from '../../../database/schema';
import {
  BaseRegisterDto,
  DeliveryCompanyInfoDto,
} from '../../auth/dto/register.dto';

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true'
    ? true
    : value === false || value === 'false'
      ? false
      : value;

// ------------------------------------------------------------- onboarding

export class DeliveryRegisterDto extends BaseRegisterDto {
  @ApiProperty({
    enum: ['COMPANY', 'DRIVER'],
    description:
      'COMPANY = delivery company (the registrant becomes its admin). DRIVER = independent driver (can later join a company by invitation).',
  })
  @IsIn(['COMPANY', 'DRIVER'])
  account_type!: 'COMPANY' | 'DRIVER';

  @ApiPropertyOptional({
    type: DeliveryCompanyInfoDto,
    description: 'Required when account_type = COMPANY.',
  })
  @ValidateIf((o: DeliveryRegisterDto) => o.account_type === 'COMPANY')
  @ValidateNested()
  @Type(() => DeliveryCompanyInfoDto)
  company?: DeliveryCompanyInfoDto;

  @ApiPropertyOptional({
    enum: vehicleTypeEnum.enumValues,
    description: 'Required when account_type = DRIVER.',
  })
  @ValidateIf((o: DeliveryRegisterDto) => o.account_type === 'DRIVER')
  @IsEnum(vehicleTypeEnum.enumValues)
  vehicle_type?: (typeof vehicleTypeEnum.enumValues)[number];

  @ApiPropertyOptional({ example: '01234-116-16', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  plate_number?: string;

  @ApiPropertyOptional({
    description: 'Driving license number (stored encrypted).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  license_number?: string;
}

export class DriverDocumentDto {
  @ApiProperty({ enum: driverDocTypeEnum.enumValues })
  @IsEnum(driverDocTypeEnum.enumValues)
  doc_type!: (typeof driverDocTypeEnum.enumValues)[number];

  @ApiProperty({
    format: 'uuid',
    description: 'File uploaded with purpose DRIVER_DOC.',
  })
  @IsUUID()
  file_id!: string;
}

export class CompanyDocumentDto {
  @ApiProperty({ enum: deliveryCompanyDocTypeEnum.enumValues })
  @IsEnum(deliveryCompanyDocTypeEnum.enumValues)
  doc_type!: (typeof deliveryCompanyDocTypeEnum.enumValues)[number];

  @ApiProperty({
    format: 'uuid',
    description: 'File uploaded with purpose DELIVERY_COMPANY_DOC.',
  })
  @IsUUID()
  file_id!: string;
}

export class InviteDriverDto {
  @ApiPropertyOptional({ example: 'driver@example.dz' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ example: '+213661234567' })
  @IsOptional()
  @IsPhone()
  phone?: string;
}

export class AcceptDriverInvitationDto {
  @ApiProperty({ description: 'Invitation token received by SMS / email.' })
  @IsString()
  @Length(16, 128)
  token!: string;
}

// ------------------------------------------------------------- driver

export class AvailabilityDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  is_available!: boolean;
}

export class LocationDto {
  @ApiProperty({ example: 36.7538 })
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 3.0588 })
  @IsLongitude()
  longitude!: number;
}

export class AvailableJobsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Max distance (km) between your last location and the pharmacy. Ignored if your location is unknown.',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  radius_km: number = 20;

  @ApiPropertyOptional({ description: 'Destination wilaya (1-58).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(58)
  wilaya_id?: number;

  @ApiPropertyOptional({ description: 'Destination commune id.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  commune_id?: number;
}

export class ReleaseJobDto {
  @ApiProperty({ minLength: 3, maxLength: 500, example: 'Panne de moto' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class PickupCodeDto {
  @ApiProperty({
    example: '482913',
    description: '6-digit code shown by the pharmacy.',
  })
  @Matches(/^\d{6}$/)
  pickup_code!: string;
}

export class StartDeliveryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 600, example: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  eta_minutes?: number;
}

export class ConfirmDeliveryDto {
  @ApiPropertyOptional({
    example: '019284',
    description: 'OTP given by the patient (preferred proof).',
  })
  @IsOptional()
  @Matches(/^\d{6}$/)
  delivery_code?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Signature image (file purpose PROOF_OF_DELIVERY).',
  })
  @IsOptional()
  @IsUUID()
  signature_file_id?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Photo of the parcel at the door (purpose PROOF_OF_DELIVERY). Must not show any face.',
  })
  @IsOptional()
  @IsUUID()
  photo_file_id?: string;

  @ApiPropertyOptional({
    description:
      'Required true with photo_file_id: the driver confirms no face is visible.',
  })
  @ValidateIf((o: ConfirmDeliveryDto) => !!o.photo_file_id)
  @Transform(toBool)
  @Equals(true)
  photo_has_no_face?: boolean;
}

export class FailDeliveryDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    example: 'Patient injoignable après 3 appels',
  })
  @IsString()
  @Length(3, 500)
  reason!: string;

  @ApiProperty({
    minimum: 1,
    maximum: 10,
    example: 2,
    description: 'Delivery attempts made.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  attempts!: number;
}

export class DeliveryHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: deliveryStatusEnum.enumValues })
  @IsOptional()
  @IsEnum(deliveryStatusEnum.enumValues)
  status?: (typeof deliveryStatusEnum.enumValues)[number];
}

export class PeriodQueryDto {
  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'Inclusive (UTC). Default: 30 days ago.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description: 'Inclusive (UTC). Default: today.',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class CompanyDriversQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Only drivers currently available.' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  available?: boolean;
}
