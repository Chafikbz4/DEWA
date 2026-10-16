import {
  BadRequestException,
  Body,
  Controller,
  createParamDecorator,
  Delete,
  ExecutionContext,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  PipeTransform,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import {
  ADMIN_SUB_ROLES,
  AdminSubRole,
  Permission,
  PERMISSIONS as P,
} from '../../common/auth/permissions';
import {
  RequirePermissions,
  RequireSuperAdmin,
} from '../../common/auth/permissions.guard';
import { PaginationQueryDto } from '../../common/http/pagination.dto';
import { Lang } from '../../common/i18n/i18n.service';
import { ApiErrors } from '../../common/swagger/api-responses';
import { AdminAccessService } from './admin-access.service';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminComplaintsService } from './admin-complaints.service';
import { AdminConfigService } from './admin-config.service';
import { AdminInsightsService } from './admin-insights.service';
import { AdminSettingsService } from './admin-settings.service';
import {
  AdminComplaintsQueryDto,
  AdminMedicinesQueryDto,
  AnalyticsQueryDto,
  ApproveDto,
  AssignComplaintDto,
  AuditQueryDto,
  CommissionQueryDto,
  ComplaintNoteDto,
  ComplaintStatusDto,
  CreateCommissionDto,
  CreateFeeRuleDto,
  CreateZoneDto,
  DeliverySettingsDto,
  FeeRulesQueryDto,
  GrantsQueryDto,
  ImportQueryDto,
  MedicineDto,
  MonitoringQueryDto,
  ReasonDto,
  RequestDocumentsDto,
  ResolveComplaintDto,
  SensitiveAccessDto,
  SetAdminRolesDto,
  SetRolePermissionsDto,
  TemplateDto,
  UpdateCommissionDto,
  UpdateFeeRuleDto,
  UpdateMedicineDto,
  UpdatePolicyDto,
  UpdateSettingDto,
  UpdateZoneDto,
  VerificationQueueDto,
  ZonesQueryDto,
} from './dto/admin.dto';
import { MonitoringService } from './monitoring.service';
import { SensitiveGrantsService } from './sensitive-grants.service';
import {
  VERIFICATION_KINDS,
  VerificationKind,
  VerificationService,
} from './verification.service';

const ADM = [
  'PERMISSION_DENIED',
  'ADMIN_MFA_REQUIRED',
  'ROLE_FORBIDDEN',
  'AUTH_TOKEN_MISSING',
] as const;

/** Effective permissions resolved by PermissionsGuard. */
const Granted = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<{ permissions?: Set<Permission> }>()
      .permissions ?? new Set<Permission>(),
);

class OneOfPipe<T extends string> implements PipeTransform<string, T> {
  constructor(private readonly allowed: readonly T[]) {}
  transform(value: string): T {
    if (!this.allowed.includes(value as T))
      throw new BadRequestException(
        `must be one of ${this.allowed.join(', ')}`,
      );
    return value as T;
  }
}
const kindPipe = new OneOfPipe<VerificationKind>(VERIFICATION_KINDS);
const langPipe = new OneOfPipe<Lang>(['fr', 'ar']);

// ------------------------------------------------------------- access

@ApiTags('Admin – access & permissions')
@ApiBearerAuth()
@Controller('admin')
export class AdminAccessController {
  constructor(private readonly access: AdminAccessService) {}

  @Get('me/permissions')
  @RequirePermissions()
  @ApiOperation({
    summary:
      'My admin sub-roles and effective permissions (any MFA-enabled admin)',
  })
  @ApiErrors(...ADM)
  me(@CurrentUser() user: AuthUser) {
    return this.access.me(user);
  }

  @Get('permissions')
  @RequireSuperAdmin()
  @ApiOperation({
    summary: 'Permission matrix per admin sub-role (SUPER_ADMIN)',
  })
  @ApiErrors(...ADM)
  matrix() {
    return this.access.matrix();
  }

  @Put('permissions/:role')
  @RequireSuperAdmin()
  @ApiParam({ name: 'role', enum: ADMIN_SUB_ROLES })
  @ApiOperation({
    summary: 'Replace the permissions of a sub-role (SUPER_ADMIN, audited)',
  })
  @ApiErrors('VALIDATION_FAILED', ...ADM)
  setRole(
    @CurrentUser() user: AuthUser,
    @Param('role', new OneOfPipe<AdminSubRole>(ADMIN_SUB_ROLES))
    role: AdminSubRole,
    @Body() dto: SetRolePermissionsDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.access.setRolePermissions(
      user,
      role,
      dto.permissions as Permission[],
      dto.reason,
      meta,
    );
  }

  @Put('users/:id/admin-roles')
  @RequireSuperAdmin()
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Set the sub-roles of an ADMIN account (SUPER_ADMIN, audited; removal revokes sessions)',
  })
  @ApiErrors(
    'USER_NOT_FOUND',
    'ADMIN_ROLE_TARGET_INVALID',
    'CANNOT_MODIFY_SELF',
    ...ADM,
  )
  setUserRoles(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetAdminRolesDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.access.setUserRoles(user, id, dto.roles, dto.reason, meta);
  }
}

// -------------------------------------------------------- verification

@ApiTags('Admin – verification')
@ApiBearerAuth()
@Controller('admin/verification')
export class AdminVerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get(':kind')
  @RequirePermissions(P.VERIFICATION_READ)
  @ApiParam({ name: 'kind', enum: VERIFICATION_KINDS })
  @ApiOperation({
    summary: 'Verification queue (oldest first; default status = pending)',
  })
  @ApiErrors(...ADM)
  queue(
    @Param('kind', kindPipe) kind: VerificationKind,
    @Query() q: VerificationQueueDto,
  ) {
    return this.verification.queue(kind, q);
  }

  @Get(':kind/:id')
  @RequirePermissions(P.VERIFICATION_READ)
  @ApiParam({ name: 'kind', enum: VERIFICATION_KINDS })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Entity under review with its documents (open them with GET /files/:file_id/access-url – logged)',
  })
  @ApiErrors('NOT_FOUND', ...ADM)
  get(
    @Param('kind', kindPipe) kind: VerificationKind,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.verification.get(kind, id);
  }

  @Post(':kind/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.VERIFICATION_DECIDE)
  @ApiParam({ name: 'kind', enum: VERIFICATION_KINDS })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Approve: entity VERIFIED, pending documents APPROVED, account ACTIVE, holder notified',
  })
  @ApiErrors('NOT_FOUND', 'VERIFICATION_INVALID_STATE', ...ADM)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('kind', kindPipe) kind: VerificationKind,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ApproveDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.verification.decide(
      user,
      kind,
      id,
      'APPROVED',
      { note: dto.note },
      meta,
    );
  }

  @Post(':kind/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.VERIFICATION_DECIDE)
  @ApiParam({ name: 'kind', enum: VERIFICATION_KINDS })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Reject with a reason (holder notified)' })
  @ApiErrors(
    'NOT_FOUND',
    'VERIFICATION_INVALID_STATE',
    'VERIFICATION_REASON_REQUIRED',
    ...ADM,
  )
  reject(
    @CurrentUser() user: AuthUser,
    @Param('kind', kindPipe) kind: VerificationKind,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.verification.decide(
      user,
      kind,
      id,
      'REJECTED',
      { reason: dto.reason },
      meta,
    );
  }

  @Post(':kind/:id/request-documents')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.VERIFICATION_DECIDE)
  @ApiParam({
    name: 'kind',
    enum: ['pharmacies', 'delivery-companies', 'drivers'],
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Ask for more / new documents (listed types are marked REJECTED; pharmacies go back to DRAFT to resubmit)',
  })
  @ApiErrors('NOT_FOUND', 'VERIFICATION_INVALID_STATE', ...ADM)
  requestDocs(
    @CurrentUser() user: AuthUser,
    @Param('kind', kindPipe) kind: VerificationKind,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RequestDocumentsDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.verification.decide(
      user,
      kind,
      id,
      'DOCUMENTS_REQUESTED',
      { reason: dto.reason, doc_types: dto.doc_types },
      meta,
    );
  }
}

// ---------------------------------------------- monitoring & sensitive access

@ApiTags('Admin – monitoring & sensitive access')
@ApiBearerAuth()
@Controller('admin')
export class AdminMonitoringController {
  constructor(
    private readonly monitoring: MonitoringService,
    private readonly grants: SensitiveGrantsService,
  ) {}

  @Get('requests')
  @RequirePermissions(P.MONITORING_READ)
  @ApiOperation({
    summary: 'Requests – metadata only (no items, files, notes or Chifa data)',
  })
  @ApiErrors(...ADM)
  requests(@Query() q: MonitoringQueryDto) {
    return this.monitoring.listRequests(q);
  }

  @Get('requests/:id')
  @RequirePermissions(P.MONITORING_READ)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Request metadata: recipients, offers (totals only), counts',
  })
  @ApiErrors('NOT_FOUND', ...ADM)
  request(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.monitoring.getRequest(id);
  }

  @Get('requests/:id/content')
  @RequirePermissions(P.SENSITIVE_ACCESS)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Prescription items, files and Chifa data of a request',
    description:
      'Requires an active REQUEST grant (POST /admin/sensitive-access), otherwise 403 SENSITIVE_ACCESS_GRANT_REQUIRED. Every read is logged.',
  })
  @ApiErrors('SENSITIVE_ACCESS_GRANT_REQUIRED', 'NOT_FOUND', ...ADM)
  content(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.monitoring.requestContent(user, id, meta);
  }

  @Get('orders')
  @RequirePermissions(P.MONITORING_READ)
  @ApiOperation({
    summary: 'Orders – amounts, statuses, parties (no item names)',
  })
  @ApiErrors(...ADM)
  orders(@Query() q: MonitoringQueryDto) {
    return this.monitoring.listOrders(q);
  }

  @Get('orders/:id')
  @RequirePermissions(P.MONITORING_READ)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Order metadata with status history, payments, refunds and delivery',
  })
  @ApiErrors('ORDER_NOT_FOUND', ...ADM)
  order(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.monitoring.getOrder(id);
  }

  @Get('conversations/:id/messages')
  @RequirePermissions(P.SENSITIVE_ACCESS)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Messages of a conversation – requires an active CONVERSATION grant; logged',
  })
  @ApiErrors('SENSITIVE_ACCESS_GRANT_REQUIRED', 'NOT_FOUND', ...ADM)
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: PaginationQueryDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.monitoring.conversationMessages(user, id, q, meta);
  }

  @Post('sensitive-access')
  @RequirePermissions(P.SENSITIVE_ACCESS)
  @ApiOperation({
    summary: 'Open a time-limited grant to sensitive content',
    description:
      'Justification ≥ 20 characters. Valid for sensitive_access_grant_minutes (default 30). Recorded in sensitive_access_logs.',
  })
  @ApiErrors('NOT_FOUND', 'VALIDATION_FAILED', ...ADM)
  grant(
    @CurrentUser() user: AuthUser,
    @Body() dto: SensitiveAccessDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.grants.create(user, dto, meta);
  }

  @Get('sensitive-access')
  @RequirePermissions()
  @ApiOperation({
    summary:
      'My grants (all=true lists every admin’s grants – requires audit.read)',
  })
  @ApiErrors(...ADM)
  listGrants(
    @CurrentUser() user: AuthUser,
    @Query() q: GrantsQueryDto,
    @Granted() granted: Set<Permission>,
  ) {
    return this.grants.list(user, q, granted.has(P.AUDIT_READ));
  }

  @Delete('sensitive-access/:id')
  @RequirePermissions()
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Close one of my grants early' })
  @ApiErrors('NOT_FOUND', ...ADM)
  revokeGrant(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.grants.revoke(user, id, meta);
  }
}

// ------------------------------------------------------------- finance

@ApiTags('Admin – payments')
@ApiBearerAuth()
@Controller('admin/payments')
export class AdminFinanceController {
  constructor(private readonly insights: AdminInsightsService) {}

  @Get('dashboard')
  @RequirePermissions(P.PAYMENTS_READ)
  @ApiOperation({
    summary:
      'Reconciliation dashboard: pending / failed payments, captured amount, refunds to process, settlements, open issues by kind',
  })
  @ApiErrors(...ADM)
  dashboard() {
    return this.insights.financeDashboard();
  }
}

// ------------------------------------------------------------ delivery

@ApiTags('Admin – delivery configuration')
@ApiBearerAuth()
@Controller('admin/delivery')
export class AdminDeliveryConfigController {
  constructor(private readonly config: AdminConfigService) {}

  @Get('zones')
  @RequirePermissions(P.DELIVERY_CONFIG_MANAGE)
  @ApiOperation({ summary: 'Delivery zones' })
  @ApiErrors(...ADM)
  zones(@Query() q: ZonesQueryDto) {
    return this.config.listZones(q);
  }

  @Post('zones')
  @RequirePermissions(P.DELIVERY_CONFIG_MANAGE)
  @ApiOperation({ summary: 'Create a zone (whole wilaya or one commune)' })
  @ApiErrors('GEO_INVALID_COMMUNE', 'DELIVERY_ZONE_EXISTS', ...ADM)
  createZone(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateZoneDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.config.createZone(user, dto, meta);
  }

  @Patch('zones/:id')
  @RequirePermissions(P.DELIVERY_CONFIG_MANAGE)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Activate / deactivate a zone' })
  @ApiErrors('NOT_FOUND', ...ADM)
  updateZone(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateZoneDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.config.updateZone(user, id, dto, meta);
  }

  @Get('fee-rules')
  @RequirePermissions(P.DELIVERY_CONFIG_MANAGE)
  @ApiOperation({ summary: 'Delivery fee rules' })
  @ApiErrors(...ADM)
  feeRules(@Query() q: FeeRulesQueryDto) {
    return this.config.listFeeRules(q);
  }

  @Post('fee-rules')
  @RequirePermissions(P.DELIVERY_CONFIG_MANAGE)
  @ApiOperation({
    summary: 'Create a fee rule (base + per km, clamped to [min, max])',
  })
  @ApiErrors('NOT_FOUND', 'VALIDATION_FAILED', ...ADM)
  createFeeRule(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFeeRuleDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.config.createFeeRule(user, dto, meta);
  }

  @Patch('fee-rules/:id')
  @RequirePermissions(P.DELIVERY_CONFIG_MANAGE)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Update / deactivate a fee rule (audited before/after)',
  })
  @ApiErrors('NOT_FOUND', 'VALIDATION_FAILED', ...ADM)
  updateFeeRule(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFeeRuleDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.config.updateFeeRule(user, id, dto, meta);
  }

  @Get('settings')
  @RequirePermissions(P.DELIVERY_CONFIG_MANAGE)
  @ApiOperation({ summary: 'Delivery timeouts and limits' })
  @ApiErrors(...ADM)
  settings() {
    return this.config.deliverySettings();
  }

  @Patch('settings')
  @RequirePermissions(P.DELIVERY_CONFIG_MANAGE)
  @ApiOperation({
    summary:
      'Change delivery timeouts / limits (reason required; history kept)',
  })
  @ApiErrors('SETTING_NOT_FOUND', 'SETTING_VALUE_INVALID', ...ADM)
  updateSettings(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeliverySettingsDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    const { reason, ...values } = dto;
    return this.config.updateDeliverySettings(user, values, reason, meta);
  }
}

// ---------------------------------------------------------- complaints

@ApiTags('Admin – complaints')
@ApiBearerAuth()
@Controller('admin/complaints')
export class AdminComplaintsController {
  constructor(private readonly complaints: AdminComplaintsService) {}

  @Get()
  @RequirePermissions(P.COMPLAINTS_READ)
  @ApiOperation({ summary: 'Complaints / disputes queue' })
  @ApiErrors(...ADM)
  list(@CurrentUser() user: AuthUser, @Query() q: AdminComplaintsQueryDto) {
    return this.complaints.list(user, q);
  }

  @Get(':id')
  @RequirePermissions(P.COMPLAINTS_READ)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Complaint with messages and internal notes' })
  @ApiErrors('COMPLAINT_NOT_FOUND', ...ADM)
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.complaints.get(id);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.COMPLAINTS_MANAGE)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Assign to an admin (default: yourself); OPEN → IN_REVIEW',
  })
  @ApiErrors(
    'COMPLAINT_NOT_FOUND',
    'COMPLAINT_CLOSED',
    'COMPLAINT_ASSIGNEE_INVALID',
    ...ADM,
  )
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignComplaintDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.complaints.assign(user, id, dto.admin_user_id, meta);
  }

  @Patch(':id/status')
  @RequirePermissions(P.COMPLAINTS_MANAGE)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'IN_REVIEW / ESCALATED / REJECTED (reason required)',
  })
  @ApiErrors('COMPLAINT_NOT_FOUND', 'COMPLAINT_CLOSED', ...ADM)
  status(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ComplaintStatusDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.complaints.setStatus(user, id, dto.status, dto.reason, meta);
  }

  @Post(':id/notes')
  @RequirePermissions(P.COMPLAINTS_MANAGE)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Internal note (never visible to the parties)' })
  @ApiErrors('COMPLAINT_NOT_FOUND', ...ADM)
  note(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ComplaintNoteDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.complaints.addNote(user, id, dto.body, meta);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.COMPLAINTS_MANAGE)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Resolve with an outcome',
    description:
      'REFUND creates a refund request (approved in the refund queue); WARNING notifies the party; SUSPENSION suspends it and also requires users.manage.',
  })
  @ApiErrors(
    'COMPLAINT_NOT_FOUND',
    'COMPLAINT_CLOSED',
    'COMPLAINT_OUTCOME_INVALID',
    'REFUND_NOT_ALLOWED',
    'REFUND_AMOUNT_INVALID',
    ...ADM,
  )
  resolve(
    @CurrentUser() user: AuthUser,
    @Granted() granted: Set<Permission>,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResolveComplaintDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.complaints.resolve(user, granted, id, dto, meta);
  }
}

// ------------------------------------------- commission & eligibility

@ApiTags('Admin – commission & eligibility')
@ApiBearerAuth()
@Controller('admin')
export class AdminRulesController {
  constructor(private readonly config: AdminConfigService) {}

  @Get('commission-rules')
  @RequirePermissions(P.COMMISSION_MANAGE)
  @ApiOperation({ summary: 'Commission / subscription rules' })
  @ApiErrors(...ADM)
  commission(@Query() q: CommissionQueryDto) {
    return this.config.listCommission(q);
  }

  @Post('commission-rules')
  @RequirePermissions(P.COMMISSION_MANAGE)
  @ApiOperation({
    summary:
      'Create a rule – always created DISABLED; legal_review_note required',
  })
  @ApiErrors('VALIDATION_FAILED', 'PHARMACY_NOT_FOUND', ...ADM)
  createCommission(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCommissionDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.config.createCommission(user, dto, meta);
  }

  @Patch('commission-rules/:id')
  @RequirePermissions(P.COMMISSION_MANAGE)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Update / activate a rule (activation requires a legal_review_note)',
  })
  @ApiErrors(
    'NOT_FOUND',
    'LEGAL_REVIEW_NOTE_REQUIRED',
    'VALIDATION_FAILED',
    ...ADM,
  )
  updateCommission(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCommissionDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.config.updateCommission(user, id, dto, meta);
  }

  @Get('eligibility-policies')
  @RequirePermissions(P.ELIGIBILITY_MANAGE)
  @ApiOperation({ summary: 'Eligibility policies per medicine category' })
  @ApiErrors(...ADM)
  policies() {
    return this.config.listPolicies();
  }

  @Patch('eligibility-policies/:id')
  @RequirePermissions(P.ELIGIBILITY_MANAGE)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Change a policy (immediate, audited)',
    description:
      'Enabling requires legal_basis_reference (always for CONTROLLED / PSYCHOTROPIC); these categories keep pharmacist validation.',
  })
  @ApiErrors(
    'NOT_FOUND',
    'ELIGIBILITY_LEGAL_BASIS_REQUIRED',
    'ELIGIBILITY_RULE_FORBIDDEN',
    ...ADM,
  )
  updatePolicy(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePolicyDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.config.updatePolicy(user, id, dto, meta);
  }
}

// ------------------------------------------------------------- catalog

@ApiTags('Admin – medicine catalogue')
@ApiBearerAuth()
@Controller('admin/medicines')
export class AdminCatalogController {
  constructor(private readonly catalog: AdminCatalogService) {}

  @Get()
  @RequirePermissions(P.CATALOG_MANAGE)
  @ApiOperation({ summary: 'Medicines (incl. inactive)' })
  @ApiErrors(...ADM)
  list(@Query() q: AdminMedicinesQueryDto) {
    return this.catalog.list(q);
  }

  @Post()
  @RequirePermissions(P.CATALOG_MANAGE)
  @ApiOperation({ summary: 'Create a medicine' })
  @ApiErrors('MEDICINE_CODE_TAKEN', ...ADM)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: MedicineDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.catalog.create(user, dto, meta);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(P.CATALOG_MANAGE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'CSV ≤ 5 MB, ≤ 10 000 lines',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'CSV import (create or update by regulatory_code)',
    description:
      'Header: brand_name*, category*, name_ar, inn_dci, form, dosage, pack_size, manufacturer, requires_prescription, reimbursable_flag, regulatory_code. Returns a line report; dry_run=true validates only.',
  })
  @ApiErrors('CATALOG_IMPORT_INVALID_FILE', ...ADM)
  import(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Query() q: ImportQueryDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.catalog.importCsv(user, file?.buffer, q.dry_run ?? false, meta);
  }

  @Patch(':id')
  @RequirePermissions(P.CATALOG_MANAGE)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Update a medicine (audited before/after)' })
  @ApiErrors('MEDICINE_NOT_FOUND', 'MEDICINE_CODE_TAKEN', ...ADM)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMedicineDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.catalog.update(user, id, dto, meta);
  }

  @Delete(':id')
  @RequirePermissions(P.CATALOG_MANAGE)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Deactivate (soft delete) a medicine' })
  @ApiErrors('MEDICINE_NOT_FOUND', ...ADM)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.catalog.deactivate(user, id, meta);
  }
}

// ------------------------------------------- analytics, audit & settings

@ApiTags('Admin – analytics, audit & settings')
@ApiBearerAuth()
@Controller('admin')
export class AdminInsightsController {
  constructor(
    private readonly insights: AdminInsightsService,
    private readonly settings: AdminSettingsService,
  ) {}

  @Get('analytics/overview')
  @RequirePermissions(P.ANALYTICS_READ)
  @ApiOperation({
    summary:
      'Requests, offer conversion, orders by status, GMV, delivery success, response time – by wilaya and date',
  })
  @ApiErrors('VALIDATION_FAILED', ...ADM)
  overview(@Query() q: AnalyticsQueryDto) {
    return this.insights.overview(q);
  }

  @Get('audit-logs')
  @RequirePermissions(P.AUDIT_READ)
  @ApiOperation({ summary: 'Audit trail (filters, paginated)' })
  @ApiErrors(...ADM)
  audit(@Query() q: AuditQueryDto) {
    return this.insights.auditLogs(q);
  }

  @Get('audit-logs/export')
  @RequirePermissions(P.AUDIT_READ)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'CSV export of the audit trail (same filters, max 10 000 rows; the export is audited)',
  })
  @ApiErrors(...ADM)
  async exportAudit(
    @CurrentUser() user: AuthUser,
    @Query() q: AuditQueryDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    const { actor_user_id, action, resource_type, resource_id, from, to } = q;
    const csv = await this.insights.exportAudit(
      user,
      { actor_user_id, action, resource_type, resource_id, from, to },
      meta,
    );
    return new StreamableFile(csv, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
  }

  @Get('security-events')
  @RequirePermissions(P.SECURITY_READ)
  @ApiOperation({
    summary:
      'Security events (failed logins, lockouts, token reuse, sensitive reads…) + last-24h signals (suspicious IPs)',
  })
  @ApiErrors(...ADM)
  security(@Query() q: AuditQueryDto) {
    return this.insights.securityEvents(q);
  }

  @Get('settings')
  @RequirePermissions(P.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Platform settings with defaults and allowed values',
  })
  @ApiErrors(...ADM)
  listSettings() {
    return this.settings.list();
  }

  @Patch('settings/:key')
  @RequirePermissions(P.SETTINGS_MANAGE)
  @ApiParam({ name: 'key' })
  @ApiOperation({
    summary: 'Change a setting (typed; reason required; history kept)',
  })
  @ApiErrors('SETTING_NOT_FOUND', 'SETTING_VALUE_INVALID', ...ADM)
  updateSetting(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.settings.update(user, key, dto.value, dto.reason, meta);
  }

  @Get('settings/:key/history')
  @RequirePermissions(P.SETTINGS_MANAGE)
  @ApiParam({ name: 'key' })
  @ApiOperation({ summary: 'Change history of a setting' })
  @ApiErrors('SETTING_NOT_FOUND', ...ADM)
  settingHistory(@Param('key') key: string, @Query() q: PaginationQueryDto) {
    return this.settings.history(key, q);
  }

  @Get('notification-templates')
  @RequirePermissions(P.TEMPLATES_MANAGE)
  @ApiOperation({
    summary:
      'Notification templates (defaults + overrides) per type and language',
  })
  @ApiErrors(...ADM)
  templates() {
    return this.settings.listTemplates();
  }

  @Put('notification-templates/:type/:lang')
  @RequirePermissions(P.TEMPLATES_MANAGE)
  @ApiParam({ name: 'type' })
  @ApiParam({ name: 'lang', enum: ['fr', 'ar'] })
  @ApiOperation({
    summary:
      'Override a template (only the default template’s placeholders are allowed)',
  })
  @ApiErrors(
    'NOTIFICATION_TEMPLATE_NOT_FOUND',
    'NOTIFICATION_TEMPLATE_INVALID',
    ...ADM,
  )
  putTemplate(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Param('lang', langPipe) lang: Lang,
    @Body() dto: TemplateDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.settings.putTemplate(user, type, lang, dto, meta);
  }

  @Delete('notification-templates/:type/:lang')
  @RequirePermissions(P.TEMPLATES_MANAGE)
  @ApiParam({ name: 'type' })
  @ApiParam({ name: 'lang', enum: ['fr', 'ar'] })
  @ApiOperation({ summary: 'Back to the default template' })
  @ApiErrors('NOTIFICATION_TEMPLATE_NOT_FOUND', ...ADM)
  resetTemplate(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Param('lang', langPipe) lang: Lang,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.settings.resetTemplate(user, type, lang, meta);
  }
}
