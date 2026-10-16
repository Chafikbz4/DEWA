import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import type { AuthUser } from '../../../common/auth/auth-user';
import {
  AllowAccountStatus,
  CurrentUser,
  OptionalAuth,
  Public,
  ReqLang,
  ReqMeta,
  RequestMeta,
} from '../../../common/auth/decorators';
import { OwnsResource } from '../../../common/auth/ownership.guard';
import { PaginationQueryDto } from '../../../common/http/pagination.dto';
import { Lang } from '../../../common/i18n/i18n.service';
import {
  ApiEnvelope,
  ApiErrors,
  MessageResultDto,
} from '../../../common/swagger/api-responses';
import {
  ChangePasswordDto,
  DeviceDto,
  ForgotPasswordDto,
  LoginResponseDto,
  MfaDisableDto,
  MfaEnableDto,
  MfaSetupDto,
  MfaSetupResponseDto,
  MfaStatusDto,
  OtpRequestDto,
  OtpSentDto,
  OtpVerifyDto,
  OtpVerifyResponseDto,
  RegisterDeviceDto,
  ResetPasswordDto,
} from '../dto/auth.dto';
import { AuthService } from '../services/auth.service';
import { DevicesService } from '../services/devices.service';

@ApiTags('Auth – OTP')
@Controller('auth/otp')
export class OtpController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @OptionalAuth()
  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Send a 6-digit code',
    description:
      'REGISTER / LOGIN / RESET_PASSWORD are public and always answer 202 (no enumeration). LOGIN requires a phone target. ' +
      'VERIFY_PHONE / VERIFY_EMAIL require a Bearer token and your own phone/email. Codes expire after 5 min, ' +
      'allow 5 attempts, and can be re-requested after the cooldown (60 s).',
  })
  @ApiEnvelope(OtpSentDto, { status: HttpStatus.ACCEPTED })
  @ApiErrors(
    'OTP_RESEND_COOLDOWN',
    'OTP_PURPOSE_NOT_ALLOWED',
    'RESOURCE_FORBIDDEN',
  )
  request(
    @Body() dto: OtpRequestDto,
    @ReqLang() lang: Lang,
    @Req() req: Request,
  ) {
    return this.auth.requestOtp(dto.target, dto.purpose, lang, req.user);
  }

  @Public()
  @OptionalAuth()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Verify a code',
    description:
      'REGISTER → marks the identifier verified (patients become ACTIVE) and returns tokens (or mfa_required). ' +
      'RESET_PASSWORD → returns `reset_token` for /auth/password/reset. VERIFY_* (Bearer) → `verified: true`. ' +
      'LOGIN codes must be used with /auth/login/otp.',
  })
  @ApiEnvelope(OtpVerifyResponseDto)
  @ApiErrors(
    'OTP_INVALID',
    'OTP_TOO_MANY_ATTEMPTS',
    'OTP_PURPOSE_NOT_ALLOWED',
    'ACCOUNT_SUSPENDED',
  )
  verify(
    @Body() dto: OtpVerifyDto,
    @ReqMeta() meta: RequestMeta,
    @Req() req: Request,
  ) {
    return this.auth.verifyOtp(
      dto.target,
      dto.purpose,
      dto.code,
      meta,
      req.user,
    );
  }
}

@ApiTags('Auth – password')
@Controller('auth/password')
export class PasswordController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Start a password reset',
    description:
      'Sends a RESET_PASSWORD code to a VERIFIED email/phone. Always 202. Next: /auth/otp/verify then /auth/password/reset.',
  })
  @ApiEnvelope(OtpSentDto, { status: HttpStatus.ACCEPTED })
  @ApiErrors('OTP_RESEND_COOLDOWN')
  forgot(@Body() dto: ForgotPasswordDto, @ReqLang() lang: Lang) {
    return this.auth.forgotPassword(dto.identifier, lang);
  }

  @Public()
  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set a new password with a reset_token',
    description: 'Single use. Signs out ALL sessions and clears any lockout.',
  })
  @ApiEnvelope(MessageResultDto)
  @ApiErrors('OTP_INVALID')
  reset(@Body() dto: ResetPasswordDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.resetPassword(dto.reset_token, dto.new_password, meta);
  }

  @Post('change')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @AllowAccountStatus('PENDING_VERIFICATION')
  @ApiOperation({
    summary: 'Change password (logged in)',
    description: 'Keeps the current session, signs out all others.',
  })
  @ApiEnvelope(MessageResultDto)
  @ApiErrors(
    'AUTH_PASSWORD_INCORRECT',
    'AUTH_PASSWORD_REUSED',
    'AUTH_TOKEN_MISSING',
    'AUTH_SESSION_REVOKED',
  )
  change(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.auth.changePassword(
      user,
      dto.current_password,
      dto.new_password,
      meta,
    );
  }
}

@ApiTags('Auth – MFA (TOTP)')
@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @OptionalAuth()
  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Start TOTP enrolment',
    description:
      'Admins (mandatory) call this with the `mfa_token` from /auth/login; pharmacy staff (optional) call it with their ' +
      'Bearer token. Returns the secret + otpauth URL to show as QR code. Not available for other roles.',
  })
  @ApiEnvelope(MfaSetupResponseDto)
  @ApiErrors(
    'MFA_TOKEN_INVALID',
    'MFA_ALREADY_ENABLED',
    'MFA_NOT_AVAILABLE_FOR_ROLE',
    'AUTH_TOKEN_MISSING',
  )
  async setup(@Body() dto: MfaSetupDto, @Req() req: Request) {
    const { user } = await this.auth.resolveMfaPrincipal(
      req.user,
      dto.mfa_token,
    );
    return this.auth.mfaSetup(user);
  }

  @Public()
  @OptionalAuth()
  @Post('enable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirm TOTP enrolment with a code',
    description:
      'With `mfa_token` (login flow) → returns tokens (admins created by a super admin become ACTIVE here). ' +
      'With Bearer → returns `{ mfa_enabled: true }`.',
  })
  @ApiEnvelope(LoginResponseDto)
  @ApiErrors(
    'MFA_TOKEN_INVALID',
    'MFA_INVALID_CODE',
    'MFA_SETUP_NOT_STARTED',
    'MFA_ALREADY_ENABLED',
    'MFA_NOT_AVAILABLE_FOR_ROLE',
  )
  async enable(
    @Body() dto: MfaEnableDto,
    @Req() req: Request,
    @ReqMeta() meta: RequestMeta,
  ) {
    const { user, viaLoginFlow } = await this.auth.resolveMfaPrincipal(
      req.user,
      dto.mfa_token,
    );
    return this.auth.mfaEnable(user, dto.code, viaLoginFlow, meta);
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Disable TOTP (pharmacy staff only)',
    description:
      'Requires password + current code. Forbidden for ADMIN/SUPER_ADMIN.',
  })
  @ApiEnvelope(MfaStatusDto)
  @ApiErrors(
    'MFA_MANDATORY_FOR_ROLE',
    'MFA_NOT_ENABLED',
    'MFA_INVALID_CODE',
    'AUTH_PASSWORD_INCORRECT',
  )
  disable(
    @CurrentUser() user: AuthUser,
    @Body() dto: MfaDisableDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.auth.mfaDisable(user, dto.code, dto.password, meta);
  }
}

@ApiTags('Auth – devices & biometrics')
@ApiBearerAuth()
@AllowAccountStatus('PENDING_VERIFICATION')
@Controller('auth/devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  @ApiOperation({
    summary: 'Register this device / enable biometric login',
    description:
      'Upserts the device and BINDS the current session to it: from now on /auth/refresh for this session requires ' +
      '`device_id`. The app stores the refresh token in Keychain/Keystore behind OS biometrics. No biometric data is sent.',
  })
  @ApiEnvelope(DeviceDto, { status: HttpStatus.CREATED })
  @ApiErrors('AUTH_TOKEN_MISSING', 'AUTH_SESSION_REVOKED')
  register(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterDeviceDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.devices.register(user, dto, meta);
  }

  @Get()
  @ApiOperation({ summary: 'List your registered devices' })
  @ApiEnvelope(DeviceDto, { paginated: true })
  @ApiErrors('AUTH_TOKEN_MISSING', 'AUTH_SESSION_REVOKED')
  list(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.devices.list(user, q);
  }

  @Delete(':id')
  @OwnsResource('device')
  @ApiOperation({
    summary: 'Remove a device (disables biometrics, revokes its sessions)',
  })
  @ApiEnvelope(MessageResultDto)
  @ApiErrors('NOT_FOUND', 'DEVICE_NOT_FOUND', 'AUTH_TOKEN_MISSING')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.devices.remove(user, id, meta);
  }
}
