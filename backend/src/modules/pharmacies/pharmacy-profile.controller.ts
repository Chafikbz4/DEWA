import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser, PharmacyContext } from '../../common/auth/auth-user';
import {
  AllowAccountStatus,
  CurrentUser,
  ReqMeta,
  RequestMeta,
  Roles,
} from '../../common/auth/decorators';
import {
  CurrentPharmacy,
  MyPharmacy,
} from '../../common/auth/pharmacy-access.guard';
import { PaginationQueryDto } from '../../common/http/pagination.dto';
import {
  ApiEnvelope,
  ApiErrors,
  MessageResultDto,
} from '../../common/swagger/api-responses';
import { InvitationDto, InviteStaffDto } from '../auth/dto/register.dto';
import {
  AddDocumentDto,
  DocumentDto,
  OnDutyDto,
  PayoutAccountDto,
  PharmacyMeDto,
  PutOpeningHoursDto,
  ServiceAreaDto,
  StaffMemberDto,
  UpdatePharmacyDto,
  UpdateStaffDto,
  VerificationStatusDto,
} from './dto/pharmacy.dto';
import { PharmacyProfileService } from './pharmacy-profile.service';
import { StaffInvitationsService } from './staff-invitations.service';

const COMMON = [
  'ROLE_FORBIDDEN',
  'PHARMACY_ACCESS_DENIED',
  'AUTH_TOKEN_MISSING',
  'AUTH_SESSION_REVOKED',
] as const;
const VERIFIED = [
  'PHARMACY_NOT_VERIFIED',
  'ACCOUNT_PENDING_VERIFICATION',
  ...COMMON,
] as const;

@ApiTags('Pharmacy – profile, hours, staff, verification')
@ApiBearerAuth()
@Roles('PHARMACY_OWNER', 'PHARMACIST', 'PHARMACY_ASSISTANT')
@Controller('pharmacy')
export class PharmacyProfileController {
  constructor(
    private readonly service: PharmacyProfileService,
    private readonly invitations: StaffInvitationsService,
  ) {}

  // ---------------------------------------------------------------- profile

  @Get('me')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false })
  @ApiOperation({
    summary: 'My pharmacy (any staff role; also while pending verification)',
  })
  @ApiEnvelope(PharmacyMeDto)
  @ApiErrors(...COMMON)
  me(@CurrentPharmacy() ph: PharmacyContext) {
    return this.service.me(ph);
  }

  @Patch('me')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false, staffRoles: ['OWNER'] })
  @ApiOperation({
    summary: 'Update my pharmacy (OWNER)',
    description:
      'Legal fields (legal_name, authorization_number, tax_id_nif, commercial_register_rc) are locked once VERIFIED.',
  })
  @ApiEnvelope(PharmacyMeDto)
  @ApiErrors(
    'PHARMACY_FIELD_LOCKED',
    'GEO_INVALID_COMMUNE',
    'PHARMACY_AUTHORIZATION_NUMBER_TAKEN',
    ...COMMON,
  )
  update(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Body() dto: UpdatePharmacyDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.update(user, ph, dto, meta);
  }

  // ------------------------------------------------------------------ hours

  @Get('opening-hours')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false })
  @ApiOperation({ summary: 'Weekly opening hours' })
  @ApiErrors(...COMMON)
  hours(@CurrentPharmacy() ph: PharmacyContext) {
    return this.service.openingHours(ph);
  }

  @Put('opening-hours')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false, staffRoles: ['OWNER', 'PHARMACIST'] })
  @ApiOperation({
    summary: 'Replace the weekly opening hours (OWNER, PHARMACIST)',
  })
  @ApiErrors('OPENING_HOURS_INVALID', ...COMMON)
  putHours(
    @CurrentPharmacy() ph: PharmacyContext,
    @Body() dto: PutOpeningHoursDto,
  ) {
    return this.service.putOpeningHours(ph, dto);
  }

  @Get('on-duty')
  @MyPharmacy({ requireVerified: false })
  @ApiOperation({ summary: 'Upcoming on-duty (garde) periods' })
  @ApiErrors(...COMMON)
  onDuty(
    @CurrentPharmacy() ph: PharmacyContext,
    @Query() q: PaginationQueryDto,
  ) {
    return this.service.listOnDuty(ph, q);
  }

  @Post('on-duty')
  @MyPharmacy({ requireVerified: false, staffRoles: ['OWNER', 'PHARMACIST'] })
  @ApiOperation({
    summary: 'Add an on-duty period (OWNER, PHARMACIST)',
    description: 'Max 14 days, must end in the future.',
  })
  @ApiErrors(...COMMON)
  addOnDuty(@CurrentPharmacy() ph: PharmacyContext, @Body() dto: OnDutyDto) {
    return this.service.addOnDuty(ph, dto);
  }

  @Delete('on-duty/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy({ requireVerified: false, staffRoles: ['OWNER', 'PHARMACIST'] })
  @ApiOperation({ summary: 'Delete an on-duty period (OWNER, PHARMACIST)' })
  @ApiEnvelope(MessageResultDto)
  @ApiErrors('ON_DUTY_NOT_FOUND', ...COMMON)
  deleteOnDuty(
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.deleteOnDuty(ph, id);
  }

  // ---------------------------------------------------------- service areas

  @Get('service-areas')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false })
  @ApiOperation({
    summary: 'Service areas (where the pharmacy receives requests / delivers)',
  })
  @ApiErrors(...COMMON)
  areas(@CurrentPharmacy() ph: PharmacyContext) {
    return this.service.listServiceAreas(ph);
  }

  @Post('service-areas')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false, staffRoles: ['OWNER'] })
  @ApiOperation({ summary: 'Add a service area (OWNER)' })
  @ApiErrors('GEO_INVALID_COMMUNE', ...COMMON)
  addArea(@CurrentPharmacy() ph: PharmacyContext, @Body() dto: ServiceAreaDto) {
    return this.service.addServiceArea(ph, dto);
  }

  @Put('service-areas/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false, staffRoles: ['OWNER'] })
  @ApiOperation({ summary: 'Replace a service area (OWNER)' })
  @ApiErrors('SERVICE_AREA_NOT_FOUND', 'GEO_INVALID_COMMUNE', ...COMMON)
  updateArea(
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ServiceAreaDto,
  ) {
    return this.service.updateServiceArea(ph, id, dto);
  }

  @Delete('service-areas/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false, staffRoles: ['OWNER'] })
  @ApiOperation({ summary: 'Delete a service area (OWNER)' })
  @ApiEnvelope(MessageResultDto)
  @ApiErrors('SERVICE_AREA_NOT_FOUND', ...COMMON)
  deleteArea(
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.deleteServiceArea(ph, id);
  }

  // ---------------------------------------------------------------- payouts

  @Get('payout-accounts')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false, staffRoles: ['OWNER'] })
  @ApiOperation({ summary: 'Payout accounts (OWNER) – numbers always masked' })
  @ApiErrors(...COMMON)
  payouts(@CurrentPharmacy() ph: PharmacyContext) {
    return this.service.listPayouts(ph);
  }

  @Post('payout-accounts')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false, staffRoles: ['OWNER'] })
  @ApiOperation({
    summary: 'Add a payout account (OWNER)',
    description: 'Stored encrypted; `verified` is set by finance admins.',
  })
  @ApiErrors(...COMMON)
  addPayout(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Body() dto: PayoutAccountDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.addPayout(user, ph, dto, meta);
  }

  @Delete('payout-accounts/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false, staffRoles: ['OWNER'] })
  @ApiOperation({ summary: 'Remove a payout account (OWNER)' })
  @ApiEnvelope(MessageResultDto)
  @ApiErrors('PAYOUT_ACCOUNT_NOT_FOUND', ...COMMON)
  deletePayout(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.deletePayout(user, ph, id, meta);
  }

  // ------------------------------------------------- documents/verification

  @Get('verification')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false })
  @ApiOperation({
    summary:
      'Verification status, rejection reason, documents and what is missing',
  })
  @ApiEnvelope(VerificationStatusDto)
  @ApiErrors(...COMMON)
  verification(@CurrentPharmacy() ph: PharmacyContext) {
    return this.service.verification(ph);
  }

  @Post('verification/submit')
  @HttpCode(HttpStatus.OK)
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false, staffRoles: ['OWNER'] })
  @ApiOperation({
    summary: '(Re)submit for verification (OWNER)',
    description:
      'From DRAFT or REJECTED, once AUTHORIZATION, PHARMACIST_DIPLOMA and ID documents are uploaded (pending or approved).',
  })
  @ApiEnvelope(VerificationStatusDto)
  @ApiErrors(
    'PHARMACY_VERIFICATION_NOT_ALLOWED',
    'PHARMACY_DOCUMENTS_MISSING',
    ...COMMON,
  )
  submit(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.submitForVerification(user, ph, meta);
  }

  @Get('documents')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false, staffRoles: ['OWNER', 'PHARMACIST'] })
  @ApiOperation({ summary: 'Verification documents (OWNER, PHARMACIST)' })
  @ApiEnvelope(DocumentDto, { isArray: true })
  @ApiErrors(...COMMON)
  documents(@CurrentPharmacy() ph: PharmacyContext) {
    return this.service.listDocuments(ph);
  }

  @Post('documents')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false, staffRoles: ['OWNER'] })
  @ApiOperation({
    summary: 'Attach a document (OWNER)',
    description: 'Upload the file first with purpose PHARMACY_DOC.',
  })
  @ApiEnvelope(DocumentDto, { status: 201 })
  @ApiErrors('FILE_INVALID_FOR_USE', ...COMMON)
  addDocument(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Body() dto: AddDocumentDto,
  ) {
    return this.service.addDocument(user, ph, dto);
  }

  @Delete('documents/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @AllowAccountStatus('PENDING_VERIFICATION')
  @MyPharmacy({ requireVerified: false, staffRoles: ['OWNER'] })
  @ApiOperation({ summary: 'Remove a pending/rejected document (OWNER)' })
  @ApiEnvelope(MessageResultDto)
  @ApiErrors(
    'PHARMACY_DOCUMENT_NOT_FOUND',
    'PHARMACY_DOCUMENT_LOCKED',
    ...COMMON,
  )
  deleteDocument(
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.deleteDocument(ph, id);
  }

  // ------------------------------------------------------------------ staff

  @Get('staff')
  @MyPharmacy({ staffRoles: ['OWNER'] })
  @ApiOperation({ summary: 'List staff (OWNER)' })
  @ApiEnvelope(StaffMemberDto, { paginated: true })
  @ApiErrors(...VERIFIED)
  staff(
    @CurrentPharmacy() ph: PharmacyContext,
    @Query() q: PaginationQueryDto,
  ) {
    return this.service.listStaff(ph, q);
  }

  @Post('staff/invite')
  @MyPharmacy({ staffRoles: ['OWNER'] })
  @ApiOperation({
    summary: 'Invite a pharmacist or assistant (OWNER)',
    description: 'Same as POST /pharmacies/:id/staff/invite.',
  })
  @ApiEnvelope(InvitationDto, { status: 201 })
  @ApiErrors('AUTH_IDENTIFIER_REQUIRED', ...VERIFIED)
  invite(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Body() dto: InviteStaffDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.invitations.invite(user, ph.id, dto, meta);
  }

  @Patch('staff/:staffId')
  @ApiParam({
    name: 'staffId',
    format: 'uuid',
    description: 'pharmacy_staff id from GET /pharmacy/staff',
  })
  @MyPharmacy({ staffRoles: ['OWNER'] })
  @ApiOperation({
    summary: 'Change role / deactivate a staff member (OWNER)',
    description:
      'PHARMACIST requires a license number. Role changes and deactivation revoke the member’s sessions immediately.',
  })
  @ApiEnvelope(StaffMemberDto)
  @ApiErrors(
    'STAFF_NOT_FOUND',
    'STAFF_CANNOT_MODIFY_OWNER',
    'STAFF_LICENSE_REQUIRED',
    ...VERIFIED,
  )
  updateStaff(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('staffId', new ParseUUIDPipe()) staffId: string,
    @Body() dto: UpdateStaffDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.service.updateStaff(user, ph, staffId, dto, meta);
  }
}
