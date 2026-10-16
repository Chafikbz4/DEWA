import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { eq } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth/auth-user';
import {
  AllowAccountStatus,
  CurrentUser,
  ReqMeta,
  RequestMeta,
} from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { PaginationQueryDto } from '../../common/http/pagination.dto';
import { ApiEnvelope, ApiErrors } from '../../common/swagger/api-responses';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  ConsentType,
  consentTypeEnum,
  patientProfiles,
  staffProfiles,
  users,
} from '../../database/schema';
import { MeDto, UpdateMeDto } from '../auth/dto/auth.dto';
import { ConsentInputDto } from '../auth/dto/register.dto';
import { ConsentsService } from './consents.service';

class ConsentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: consentTypeEnum.enumValues }) type!: string;
  @ApiProperty({ example: '2026-10' }) version!: string;
  @ApiProperty() granted_at!: Date;
  @ApiPropertyOptional({ nullable: true }) revoked_at!: Date | null;
  @ApiProperty() active!: boolean;
}

class RevokeResultDto {
  @ApiProperty({ enum: consentTypeEnum.enumValues }) type!: string;
  @ApiProperty({ example: 1 }) revoked!: number;
}

class ConsentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: consentTypeEnum.enumValues })
  @IsOptional()
  @IsEnum(consentTypeEnum.enumValues)
  type?: ConsentType;

  @ApiPropertyOptional({
    description: 'true → only non-revoked consents',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  active?: boolean;
}

@ApiTags('Me – profile & consents')
@ApiBearerAuth()
@AllowAccountStatus('PENDING_VERIFICATION')
@Controller('me')
export class MeController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly consents: ConsentsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current account' })
  @ApiEnvelope(MeDto)
  @ApiErrors('AUTH_TOKEN_MISSING', 'AUTH_TOKEN_INVALID', 'AUTH_SESSION_REVOKED')
  async me(@CurrentUser() current: AuthUser): Promise<MeDto> {
    const [row] = await this.db
      .select({
        user: users,
        patientFirst: patientProfiles.firstName,
        patientLast: patientProfiles.lastName,
        staffFirst: staffProfiles.firstName,
        staffLast: staffProfiles.lastName,
      })
      .from(users)
      .leftJoin(patientProfiles, eq(patientProfiles.userId, users.id))
      .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
      .where(eq(users.id, current.id))
      .limit(1);
    if (!row) throw new AppException('USER_NOT_FOUND');
    const u = row.user;
    return {
      id: u.id,
      role: u.role,
      status: u.status,
      preferred_language: u.preferredLanguage,
      email: u.email,
      phone: u.phone,
      email_verified: !!u.emailVerifiedAt,
      phone_verified: !!u.phoneVerifiedAt,
      mfa_enabled: u.mfaEnabled,
      biometric_enabled: u.biometricEnabled,
      first_name: row.patientFirst ?? row.staffFirst ?? null,
      last_name: row.patientLast ?? row.staffLast ?? null,
      created_at: u.createdAt,
    };
  }

  @Patch()
  @ApiOperation({ summary: 'Update preferences (language)' })
  @ApiEnvelope(MeDto)
  @ApiErrors('AUTH_TOKEN_MISSING', 'AUTH_SESSION_REVOKED')
  async update(@CurrentUser() current: AuthUser, @Body() dto: UpdateMeDto) {
    await this.db
      .update(users)
      .set({ preferredLanguage: dto.preferred_language })
      .where(eq(users.id, current.id));
    return this.me(current);
  }

  @Get('consents')
  @ApiOperation({ summary: 'List your consent records (history included)' })
  @ApiEnvelope(ConsentDto, { paginated: true })
  @ApiErrors('AUTH_TOKEN_MISSING', 'AUTH_SESSION_REVOKED')
  list(@CurrentUser() user: AuthUser, @Query() q: ConsentsQueryDto) {
    return this.consents.list(user, q);
  }

  @Post('consents')
  @ApiOperation({
    summary: 'Grant a consent',
    description:
      'Idempotent for the same type+version. TERMS/PRIVACY must use the current version.',
  })
  @ApiEnvelope(ConsentDto, { status: 201 })
  @ApiErrors('AUTH_CONSENT_VERSION_OUTDATED', 'AUTH_TOKEN_MISSING')
  grant(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConsentInputDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.consents.grant(user, dto, meta);
  }

  @Delete('consents/:type')
  @ApiParam({ name: 'type', enum: consentTypeEnum.enumValues })
  @ApiOperation({
    summary: 'Revoke a consent',
    description:
      'HEALTH_DATA_PROCESSING and SHARE_PRESCRIPTION_WITH_PHARMACY can be revoked. TERMS/PRIVACY cannot (request account deletion instead).',
  })
  @ApiEnvelope(RevokeResultDto)
  @ApiErrors(
    'CONSENT_NOT_FOUND',
    'CONSENT_REQUIRED_NOT_REVOCABLE',
    'AUTH_TOKEN_MISSING',
  )
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    if (!(consentTypeEnum.enumValues as readonly string[]).includes(type)) {
      throw new AppException('CONSENT_NOT_FOUND');
    }
    return this.consents.revoke(user, type as ConsentType, meta);
  }
}
