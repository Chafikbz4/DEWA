import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import {
  CurrentUser,
  ReqMeta,
  RequestMeta,
} from '../../common/auth/decorators';
import { PERMISSIONS as P } from '../../common/auth/permissions';
import {
  RequirePermissions,
  RequireSuperAdmin,
} from '../../common/auth/permissions.guard';
import { SuspendUserDto } from './dto/admin.dto';
import { ApiEnvelope, ApiErrors } from '../../common/swagger/api-responses';
import { AdminUsersService } from './admin-users.service';
import {
  AdminUserDto,
  AdminUsersQueryDto,
  CreateAdminDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/admin-users.dto';

const COMMON = [
  'PERMISSION_DENIED',
  'ADMIN_MFA_REQUIRED',
  'ROLE_FORBIDDEN',
  'AUTH_TOKEN_MISSING',
  'AUTH_SESSION_REVOKED',
  'ACCOUNT_PENDING_VERIFICATION',
] as const;

@ApiTags('Admin – users')
@ApiBearerAuth()
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}

  @Post()
  @RequireSuperAdmin()
  @ApiOperation({
    summary: 'Create an ADMIN account (super admin only)',
    description:
      'The new admin is PENDING_VERIFICATION and becomes ACTIVE after enrolling TOTP at first login. Audited.',
  })
  @ApiEnvelope(AdminUserDto, { status: 201 })
  @ApiErrors('IDENTIFIER_ALREADY_USED', ...COMMON)
  create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateAdminDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.createAdmin(actor, dto, meta);
  }

  @Get()
  @RequirePermissions(P.USERS_READ)
  @ApiOperation({
    summary: 'List users (filter, search, sort, paginate)',
    description: 'Audited (personal data access).',
  })
  @ApiEnvelope(AdminUserDto, { paginated: true })
  @ApiErrors(...COMMON)
  list(
    @CurrentUser() actor: AuthUser,
    @Query() q: AdminUsersQueryDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.list(actor, q, meta);
  }

  @Get(':id')
  @RequirePermissions(P.USERS_READ)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'One account (contact, status, names, admin sub-roles) – never health data; audited',
  })
  @ApiErrors('USER_NOT_FOUND', ...COMMON)
  get(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.get(actor, id, meta);
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.USERS_MANAGE)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Suspend (reason required): sessions revoked, user notified, audited',
  })
  @ApiEnvelope(AdminUserDto)
  @ApiErrors('USER_NOT_FOUND', 'CANNOT_MODIFY_SELF', ...COMMON)
  suspend(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SuspendUserDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.updateStatus(
      actor,
      id,
      { status: 'SUSPENDED', reason: dto.reason },
      meta,
    );
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.USERS_MANAGE)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Reactivate (reason required): user notified, audited',
  })
  @ApiEnvelope(AdminUserDto)
  @ApiErrors('USER_NOT_FOUND', 'CANNOT_MODIFY_SELF', ...COMMON)
  reactivate(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SuspendUserDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.updateStatus(
      actor,
      id,
      { status: 'ACTIVE', reason: dto.reason },
      meta,
    );
  }

  @Patch(':id/status')
  @RequirePermissions(P.USERS_MANAGE)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Activate or suspend an account',
    description:
      'Suspension revokes all sessions immediately. Admins cannot change other admins; nobody can change a super admin or themselves. Audited with reason.',
  })
  @ApiEnvelope(AdminUserDto)
  @ApiErrors('USER_NOT_FOUND', 'CANNOT_MODIFY_SELF', ...COMMON)
  status(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserStatusDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.updateStatus(actor, id, dto, meta);
  }

  @Patch(':id/role')
  @RequireSuperAdmin()
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Change a user role (super admin only)',
    description:
      'Revokes all sessions of the user. SUPER_ADMIN cannot be granted. Audited with reason.',
  })
  @ApiEnvelope(AdminUserDto)
  @ApiErrors('USER_NOT_FOUND', 'CANNOT_MODIFY_SELF', ...COMMON)
  role(
    @CurrentUser() actor: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserRoleDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.updateRole(actor, id, dto, meta);
  }
}
