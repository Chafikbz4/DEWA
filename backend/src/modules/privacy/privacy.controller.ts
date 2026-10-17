import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { count, desc } from 'drizzle-orm';
import { Equals, IsString, Length } from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import {
  AllowAccountStatus,
  CurrentUser,
  ReqMeta,
  RequestMeta,
  Roles,
} from '../../common/auth/decorators';
import { PERMISSIONS as P } from '../../common/auth/permissions';
import {
  RequirePermissions,
  RequireSuperAdmin,
} from '../../common/auth/permissions.guard';
import { Paginated } from '../../common/http/envelope';
import { PaginationQueryDto } from '../../common/http/pagination.dto';
import { ApiErrors } from '../../common/swagger/api-responses';
import { Database, DRIZZLE } from '../../database/database.module';
import { dataRetentionJobs } from '../../database/schema';
import { PrivacyService } from './privacy.service';
import { RetentionService } from './retention.service';

class DeleteAccountDto {
  @ApiProperty({ description: 'Current password (re-authentication).' })
  @IsString()
  @Length(1, 128)
  password!: string;

  @ApiProperty({
    example: true,
    description: 'Must be true: the user confirmed the irreversible deletion.',
  })
  @Equals(true)
  confirm!: boolean;
}

@ApiTags('Me – privacy')
@ApiBearerAuth()
@Controller('me')
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Post('data-export')
  @HttpCode(HttpStatus.OK)
  @AllowAccountStatus('PENDING_VERIFICATION')
  @ApiOperation({
    summary: 'Download all my personal data (JSON)',
    description:
      'Right of access / portability. Secrets and storage internals are excluded. At most once every 10 minutes; audited.',
  })
  @ApiErrors('DATA_EXPORT_TOO_FREQUENT', 'AUTH_TOKEN_MISSING')
  async export(@CurrentUser() user: AuthUser, @ReqMeta() meta: RequestMeta) {
    const json = await this.privacy.export(user, meta);
    return new StreamableFile(json, {
      type: 'application/json; charset=utf-8',
      disposition: `attachment; filename="dewa-data-${new Date().toISOString().slice(0, 10)}.json"`,
    });
  }

  @Post('delete-account')
  @HttpCode(HttpStatus.OK)
  @Roles('PATIENT')
  @ApiOperation({
    summary: 'Delete my account (patients)',
    description:
      'Re-authentication with the password + confirm=true. Refused while an order is in progress. Personal data is erased / anonymised; ' +
      'orders, payments, refunds, receipts, consent records and audit logs are kept as legally required records without contact details. All sessions end.',
  })
  @ApiErrors(
    'AUTH_INVALID_CREDENTIALS',
    'ACCOUNT_DELETION_BLOCKED',
    'VALIDATION_FAILED',
    'ROLE_FORBIDDEN',
  )
  delete(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.privacy.deleteAccount(user, dto.password, meta);
  }
}

@ApiTags('Admin – analytics, audit & settings')
@ApiBearerAuth()
@Controller('admin/retention')
export class RetentionAdminController {
  constructor(
    private readonly retention: RetentionService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  @Get('jobs')
  @RequirePermissions(P.AUDIT_READ)
  @ApiOperation({ summary: 'Runs of the retention / secure deletion jobs' })
  @ApiErrors('PERMISSION_DENIED', 'ADMIN_MFA_REQUIRED', 'ROLE_FORBIDDEN')
  async jobs(@Query() q: PaginationQueryDto) {
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(dataRetentionJobs)
        .orderBy(desc(dataRetentionJobs.runAt))
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(dataRetentionJobs),
    ]);
    return Paginated.of(
      rows.map((r) => ({
        id: r.id,
        resource_type: r.resourceType,
        run_at: r.runAt,
        records_deleted: r.recordsDeleted,
        status: r.status,
        error_message: r.errorMessage,
      })),
      total,
      q.page,
      q.limit,
    );
  }

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @RequireSuperAdmin()
  @ApiOperation({ summary: 'Run the retention jobs now (SUPER_ADMIN)' })
  @ApiErrors('PERMISSION_DENIED', 'ADMIN_MFA_REQUIRED', 'ROLE_FORBIDDEN')
  run() {
    return this.retention.runAll();
  }
}
