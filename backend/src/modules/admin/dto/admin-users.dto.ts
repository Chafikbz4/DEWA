import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto';
import {
  IsPhone,
  IsStrongPassword,
} from '../../../common/validation/validators';
import {
  accountStatusEnum,
  languageEnum,
  roleEnum,
} from '../../../database/schema';

const ASSIGNABLE_ROLES = roleEnum.enumValues.filter((r) => r !== 'SUPER_ADMIN');

export class AdminReasonDto {
  @ApiProperty({
    description: 'Mandatory justification, stored in the audit log.',
    example: 'Documents verified – ticket #4521',
    minLength: 5,
    maxLength: 500,
  })
  @IsString()
  @Length(5, 500)
  reason!: string;
}

export class CreateAdminDto extends AdminReasonDto {
  @ApiProperty({ example: 'ops.admin@dewa.dz' })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ example: '+213550000001' })
  @IsOptional()
  @IsPhone()
  phone?: string;

  @ApiProperty({ example: 'Nadia' })
  @IsString()
  @Length(1, 100)
  first_name!: string;

  @ApiProperty({ example: 'Kaci' })
  @IsString()
  @Length(1, 100)
  last_name!: string;

  @ApiProperty({
    description:
      'Initial password, communicated out-of-band. The admin must enrol TOTP at first login.',
    example: 'Init1alAdm1nPass',
  })
  @IsStrongPassword()
  password!: string;

  @ApiProperty({ enum: languageEnum.enumValues, example: 'fr' })
  @IsEnum(languageEnum.enumValues)
  preferred_language!: 'ar' | 'fr';
}

export class UpdateUserStatusDto extends AdminReasonDto {
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED'], example: 'SUSPENDED' })
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED';
}

export class UpdateUserRoleDto extends AdminReasonDto {
  @ApiProperty({ enum: ASSIGNABLE_ROLES, example: 'ADMIN' })
  @IsIn(ASSIGNABLE_ROLES)
  role!: (typeof ASSIGNABLE_ROLES)[number];
}

export class AdminUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: roleEnum.enumValues })
  @IsOptional()
  @IsEnum(roleEnum.enumValues)
  role?: (typeof roleEnum.enumValues)[number];

  @ApiPropertyOptional({ enum: accountStatusEnum.enumValues })
  @IsOptional()
  @IsEnum(accountStatusEnum.enumValues)
  status?: (typeof accountStatusEnum.enumValues)[number];

  @ApiPropertyOptional({
    description: 'Search in email / phone (prefix, case-insensitive).',
    example: '+21355',
  })
  @IsOptional()
  @IsString()
  @Length(2, 100)
  search?: string;

  @ApiPropertyOptional({
    enum: ['created_at', 'last_login_at'],
    default: 'created_at',
  })
  @IsOptional()
  @IsIn(['created_at', 'last_login_at'])
  sort?: 'created_at' | 'last_login_at';
}

export class AdminUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: roleEnum.enumValues }) role!: string;
  @ApiProperty({ enum: accountStatusEnum.enumValues }) status!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiProperty() email_verified!: boolean;
  @ApiProperty() phone_verified!: boolean;
  @ApiProperty() mfa_enabled!: boolean;
  @ApiPropertyOptional({ nullable: true }) last_login_at!: Date | null;
  @ApiProperty() created_at!: Date;
}
