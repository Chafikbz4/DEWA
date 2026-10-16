import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  accountStatusEnum,
  devicePlatformEnum,
  languageEnum,
  roleEnum,
} from '../../../database/schema';
import {
  IsEmailOrPhone,
  IsPhone,
  IsStrongPassword,
} from '../../../common/validation/validators';

// ------------------------------------------------------------------ inputs

export class LoginDto {
  @ApiProperty({
    description: 'Email or phone (E.164 or Algerian local format).',
    example: '+213550123456',
  })
  @IsEmailOrPhone()
  identifier!: string;

  @ApiProperty({ example: 'Str0ngPassw0rd', minLength: 1, maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

export class LoginOtpDto {
  @ApiProperty({
    description: 'Verified phone number of the account.',
    example: '+213550123456',
  })
  @IsPhone()
  phone!: string;

  @ApiProperty({
    description: '6-digit code received by SMS (purpose LOGIN).',
    example: '123456',
  })
  @Matches(/^\d{6}$/)
  code!: string;
}

export class LoginMfaDto {
  @ApiProperty({
    description: 'mfa_token returned by /auth/login (valid 5 min).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  mfa_token!: string;

  @ApiProperty({
    description: '6-digit TOTP code from the authenticator app.',
    example: '492817',
  })
  @Matches(/^\d{6}$/)
  code!: string;
}

export class RefreshDto {
  @ApiProperty({
    description:
      'Opaque refresh token from a previous login/refresh. Single use: rotated on every call.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  refresh_token!: string;

  @ApiPropertyOptional({
    description:
      'Required when the session is bound to a device (biometric login). Must equal the device_id registered via POST /auth/devices.',
    example: 'b7a3c1e0-device-uuid',
  })
  @IsOptional()
  @IsString()
  @Length(8, 128)
  device_id?: string;
}

export class RegisterDeviceDto {
  @ApiProperty({
    description:
      'Stable random id generated and stored by the app (NOT a hardware id).',
    example: 'b7a3c1e0-5d1f-4c1e-9a77-2f1d5b0e8c11',
  })
  @IsString()
  @Length(8, 128)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  device_id!: string;

  @ApiProperty({ enum: devicePlatformEnum.enumValues, example: 'android' })
  @IsEnum(devicePlatformEnum.enumValues)
  platform!: (typeof devicePlatformEnum.enumValues)[number];

  @ApiProperty({
    description:
      'Enable biometric unlock for this device. Biometric data never leaves the device.',
    example: true,
  })
  @IsBoolean()
  biometric_enabled!: boolean;

  @ApiPropertyOptional({ description: 'FCM/APNs push token.', maxLength: 4096 })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  push_token?: string;

  @ApiPropertyOptional({ example: '1.0.3', maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  app_version?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPassw0rd!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  current_password!: string;

  @ApiProperty({
    description: '≥10 chars incl. upper-case, lower-case and digit.',
    example: 'NewStr0ngPassw0rd',
  })
  @IsStrongPassword()
  new_password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'amina@example.dz' })
  @IsEmailOrPhone()
  identifier!: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    description:
      'reset_token returned by POST /auth/otp/verify (purpose RESET_PASSWORD), valid 10 min, single use.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  reset_token!: string;

  @ApiProperty({ example: 'NewStr0ngPassw0rd' })
  @IsStrongPassword()
  new_password!: string;
}

export class MfaSetupDto {
  @ApiPropertyOptional({
    description:
      'Required when not authenticated with a Bearer token (admin first-login flow): the mfa_token from /auth/login.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  mfa_token?: string;
}

export class MfaEnableDto extends MfaSetupDto {
  @ApiProperty({
    description:
      'Current 6-digit TOTP code proving the authenticator was set up.',
    example: '492817',
  })
  @Matches(/^\d{6}$/)
  code!: string;
}

export class MfaDisableDto {
  @ApiProperty({ example: '492817' })
  @Matches(/^\d{6}$/)
  code!: string;

  @ApiProperty({ example: 'Str0ngPassw0rd' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

export const OTP_PURPOSES = [
  'REGISTER',
  'LOGIN',
  'RESET_PASSWORD',
  'VERIFY_PHONE',
  'VERIFY_EMAIL',
] as const;
export type OtpPurposeInput = (typeof OTP_PURPOSES)[number];

export class OtpRequestDto {
  @ApiProperty({
    description: 'Phone (E.164 / local DZ) or email the code is sent to.',
    example: '+213550123456',
  })
  @IsEmailOrPhone()
  target!: string;

  @ApiProperty({
    enum: OTP_PURPOSES,
    description:
      'VERIFY_PHONE / VERIFY_EMAIL require a Bearer token and the target must be your own phone/email.',
    example: 'REGISTER',
  })
  @IsIn(OTP_PURPOSES)
  purpose!: OtpPurposeInput;
}

export class OtpVerifyDto extends OtpRequestDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/)
  code!: string;
}

export class UpdateMeDto {
  @ApiProperty({ enum: languageEnum.enumValues, example: 'ar' })
  @IsEnum(languageEnum.enumValues)
  preferred_language!: 'ar' | 'fr';
}

// ----------------------------------------------------------------- outputs

export class UserSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: roleEnum.enumValues, example: 'PATIENT' }) role!: string;
  @ApiProperty({ enum: accountStatusEnum.enumValues, example: 'ACTIVE' })
  status!: string;
  @ApiProperty({ enum: languageEnum.enumValues, example: 'fr' })
  preferred_language!: string;
}

export class LoginResponseDto {
  @ApiPropertyOptional({
    description:
      'JWT, valid `expires_in` seconds (15 min). Absent when mfa_required.',
  })
  access_token?: string;
  @ApiPropertyOptional({
    description:
      'Opaque rotating refresh token. Store securely (Keychain/Keystore).',
  })
  refresh_token?: string;
  @ApiPropertyOptional({ example: 'Bearer' }) token_type?: string;
  @ApiPropertyOptional({ example: 900 }) expires_in?: number;
  @ApiPropertyOptional({ type: UserSummaryDto }) user?: UserSummaryDto;

  @ApiPropertyOptional({
    description:
      'true → call /auth/login/mfa (or set up MFA first if mfa_setup_required).',
    example: false,
  })
  mfa_required?: boolean;
  @ApiPropertyOptional({
    description:
      'true → admin must enrol TOTP: /auth/mfa/setup then /auth/mfa/enable with mfa_token.',
    example: false,
  })
  mfa_setup_required?: boolean;
  @ApiPropertyOptional({
    description: 'Short-lived (5 min) token for the MFA step.',
  })
  mfa_token?: string;
}

export class OtpSentDto {
  @ApiProperty({
    example: true,
    description:
      'Always true – the response never reveals whether an account exists.',
  })
  otp_sent!: boolean;
  @ApiProperty({ example: '+213*****4567' }) target_masked!: string;
  @ApiProperty({ example: 300 }) expires_in!: number;
}

export class OtpVerifyResponseDto extends LoginResponseDto {
  @ApiPropertyOptional({
    description: 'purpose=RESET_PASSWORD only: pass to /auth/password/reset.',
  })
  reset_token?: string;
  @ApiPropertyOptional({
    description: 'purpose=VERIFY_PHONE / VERIFY_EMAIL only.',
    example: true,
  })
  verified?: boolean;
}

export class MfaSetupResponseDto {
  @ApiProperty({
    description: 'Base32 secret – show once for manual entry.',
    example: 'JBSWY3DPEHPK3PXP',
  })
  secret!: string;
  @ApiProperty({
    description: 'Render as QR code in the app.',
    example: 'otpauth://totp/DEWA:admin%40dewa.dz?secret=JBSW...&issuer=DEWA',
  })
  otpauth_url!: string;
}

export class MfaStatusDto {
  @ApiProperty({ example: true }) mfa_enabled!: boolean;
}

export class SessionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({
    example: true,
    description: 'The session making this request.',
  })
  current!: boolean;
  @ApiPropertyOptional({ example: '197.200.10.5', nullable: true }) ip!:
    string | null;
  @ApiPropertyOptional({ nullable: true }) user_agent!: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) device_id!:
    string | null;
  @ApiPropertyOptional({ enum: devicePlatformEnum.enumValues, nullable: true })
  device_platform!: string | null;
  @ApiProperty() created_at!: Date;
  @ApiPropertyOptional({ nullable: true }) last_used_at!: Date | null;
  @ApiProperty() expires_at!: Date;
}

export class DeviceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'b7a3c1e0-5d1f-4c1e-9a77-2f1d5b0e8c11' })
  device_id!: string;
  @ApiProperty({ enum: devicePlatformEnum.enumValues }) platform!: string;
  @ApiProperty() biometric_enabled!: boolean;
  @ApiPropertyOptional({ nullable: true }) app_version!: string | null;
  @ApiPropertyOptional({ nullable: true }) last_seen_at!: Date | null;
  @ApiProperty() created_at!: Date;
}

export class MeDto extends UserSummaryDto {
  @ApiPropertyOptional({ nullable: true, example: 'amina@example.dz' }) email!:
    string | null;
  @ApiPropertyOptional({ nullable: true, example: '+213550123456' }) phone!:
    string | null;
  @ApiProperty() email_verified!: boolean;
  @ApiProperty() phone_verified!: boolean;
  @ApiProperty() mfa_enabled!: boolean;
  @ApiProperty() biometric_enabled!: boolean;
  @ApiPropertyOptional({ nullable: true, example: 'Amina' }) first_name!:
    string | null;
  @ApiPropertyOptional({ nullable: true, example: 'Benali' }) last_name!:
    string | null;
  @ApiProperty() created_at!: Date;
}
