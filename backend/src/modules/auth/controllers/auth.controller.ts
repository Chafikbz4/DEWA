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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { AuthUser } from '../../../common/auth/auth-user';
import {
  AllowAccountStatus,
  CurrentUser,
  Public,
  ReqMeta,
  RequestMeta,
} from '../../../common/auth/decorators';
import { OwnsResource } from '../../../common/auth/ownership.guard';
import { PaginationQueryDto } from '../../../common/http/pagination.dto';
import {
  ApiEnvelope,
  ApiErrors,
  MessageResultDto,
} from '../../../common/swagger/api-responses';
import {
  LoginDto,
  LoginMfaDto,
  LoginOtpDto,
  LoginResponseDto,
  RefreshDto,
  SessionDto,
} from '../dto/auth.dto';
import { AuthService } from '../services/auth.service';

class SessionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['created_at', 'last_used_at'],
    default: 'created_at',
  })
  @IsOptional()
  @IsIn(['created_at', 'last_used_at'])
  sort?: 'created_at' | 'last_used_at';
}

@ApiTags('Auth – login & sessions')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with email/phone + password',
    description:
      'Returns tokens, or `mfa_required: true` + `mfa_token` when TOTP is needed (always for ADMIN/SUPER_ADMIN; ' +
      '`mfa_setup_required: true` if they have not enrolled yet). After LOGIN_MAX_FAILED_ATTEMPTS (5) failures the ' +
      'account is locked for LOGIN_LOCKOUT_MINUTES (15). Errors are generic (no user enumeration).',
  })
  @ApiEnvelope(LoginResponseDto)
  @ApiErrors(
    'AUTH_INVALID_CREDENTIALS',
    'AUTH_ACCOUNT_LOCKED',
    'ACCOUNT_SUSPENDED',
  )
  login(@Body() dto: LoginDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.login(dto.identifier, dto.password, meta);
  }

  @Public()
  @Post('login/otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with phone + SMS code',
    description:
      'First call POST /auth/otp/request with purpose=LOGIN. Only verified phone numbers can log in this way.',
  })
  @ApiEnvelope(LoginResponseDto)
  @ApiErrors('OTP_INVALID', 'OTP_TOO_MANY_ATTEMPTS', 'ACCOUNT_SUSPENDED')
  loginOtp(@Body() dto: LoginOtpDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.loginWithOtp(dto.phone, dto.code, meta);
  }

  @Public()
  @Post('login/mfa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Second login step: TOTP code',
    description:
      'Use the mfa_token from /auth/login. Wrong codes count towards the lockout.',
  })
  @ApiEnvelope(LoginResponseDto)
  @ApiErrors(
    'MFA_TOKEN_INVALID',
    'MFA_INVALID_CODE',
    'MFA_SETUP_NOT_STARTED',
    'AUTH_ACCOUNT_LOCKED',
    'ACCOUNT_SUSPENDED',
  )
  loginMfa(@Body() dto: LoginMfaDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.loginWithMfa(dto.mfa_token, dto.code, meta);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate the refresh token',
    description:
      'Each refresh token works ONCE. Re-using an already-rotated token is treated as theft: the whole session family ' +
      'is revoked (AUTH_REFRESH_REUSED) and the user must log in again. Device-bound sessions also need `device_id`.',
  })
  @ApiEnvelope(LoginResponseDto)
  @ApiErrors(
    'AUTH_REFRESH_INVALID',
    'AUTH_REFRESH_REUSED',
    'AUTH_DEVICE_MISMATCH',
    'ACCOUNT_SUSPENDED',
  )
  refresh(@Body() dto: RefreshDto, @ReqMeta() meta: RequestMeta) {
    return this.auth.refresh(dto.refresh_token, dto.device_id, meta);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @AllowAccountStatus('PENDING_VERIFICATION')
  @ApiOperation({ summary: 'Revoke the current session' })
  @ApiEnvelope(MessageResultDto)
  @ApiErrors('AUTH_TOKEN_MISSING', 'AUTH_TOKEN_INVALID', 'AUTH_SESSION_REVOKED')
  logout(@CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return this.auth.logout(user, meta);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @AllowAccountStatus('PENDING_VERIFICATION')
  @ApiOperation({
    summary: 'Revoke every session of the account (including this one)',
  })
  @ApiEnvelope(MessageResultDto)
  @ApiErrors('AUTH_TOKEN_MISSING', 'AUTH_TOKEN_INVALID', 'AUTH_SESSION_REVOKED')
  logoutAll(@CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    return this.auth.logoutAll(user, meta);
  }

  @Get('sessions')
  @ApiBearerAuth()
  @AllowAccountStatus('PENDING_VERIFICATION')
  @ApiOperation({
    summary: 'List active sessions',
    description:
      'Paginated. `current: true` marks the session making the call.',
  })
  @ApiEnvelope(SessionDto, { paginated: true })
  @ApiErrors('AUTH_TOKEN_MISSING', 'AUTH_TOKEN_INVALID', 'AUTH_SESSION_REVOKED')
  sessions(@CurrentUser() user: AuthUser, @Query() q: SessionsQueryDto) {
    return this.auth.listSessions(user, q);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @AllowAccountStatus('PENDING_VERIFICATION')
  @OwnsResource('session')
  @ApiOperation({ summary: 'Revoke one of your sessions (e.g. a lost phone)' })
  @ApiEnvelope(MessageResultDto)
  @ApiErrors(
    'NOT_FOUND',
    'AUTH_SESSION_NOT_FOUND',
    'AUTH_TOKEN_MISSING',
    'AUTH_SESSION_REVOKED',
  )
  revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.auth.revokeOwnSession(user, id, meta);
  }
}
