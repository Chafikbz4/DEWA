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
  Query,
  UseInterceptors,
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
  Public,
  ReqMeta,
  RequestMeta,
  Roles,
} from '../../common/auth/decorators';
import {
  CurrentPharmacy,
  MyPharmacy,
} from '../../common/auth/pharmacy-access.guard';
import { PaginationQueryDto } from '../../common/http/pagination.dto';
import { ApiEnvelope, ApiErrors } from '../../common/swagger/api-responses';
import { OtpSentDto } from '../auth/dto/auth.dto';
import { RegistrationService } from '../auth/services/registration.service';
import { DeliveryCompanyService } from './delivery-company.service';
import { DriverPrivacyInterceptor } from './delivery-privacy';
import { DeliveryService } from './delivery.service';
import { DriverJobsService } from './driver-jobs.service';
import {
  AcceptDriverInvitationDto,
  AvailabilityDto,
  AvailableJobsQueryDto,
  CompanyDocumentDto,
  CompanyDriversQueryDto,
  ConfirmDeliveryDto,
  DeliveryHistoryQueryDto,
  DeliveryRegisterDto,
  DriverDocumentDto,
  FailDeliveryDto,
  InviteDriverDto,
  LocationDto,
  PeriodQueryDto,
  PickupCodeDto,
  ReleaseJobDto,
  StartDeliveryDto,
} from './dto/delivery.dto';

const AUTH = ['ROLE_FORBIDDEN', 'AUTH_TOKEN_MISSING'] as const;
const DRV = [
  'DRIVER_PROFILE_NOT_FOUND',
  'DRIVER_NOT_VERIFIED',
  'ACCOUNT_PENDING_VERIFICATION',
  ...AUTH,
] as const;
const JOB = [
  'DELIVERY_NOT_FOUND',
  'DELIVERY_INVALID_TRANSITION',
  'DELIVERY_VERSION_CONFLICT',
  'ORDER_INVALID_TRANSITION',
  ...DRV,
] as const;
const PH = [
  'ROLE_FORBIDDEN',
  'PHARMACY_ACCESS_DENIED',
  'PHARMACY_NOT_VERIFIED',
  'AUTH_TOKEN_MISSING',
] as const;

// ----------------------------------------------------------------- public

@ApiTags('Delivery – onboarding')
@Controller('delivery')
export class DeliveryRegisterController {
  constructor(private readonly registration: RegistrationService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Register a delivery company or an independent driver',
    description:
      'account_type COMPANY → company admin + company (PENDING_VERIFICATION); DRIVER → independent driver (PENDING_VERIFICATION). ' +
      'Then verify the OTP, log in, upload documents (purpose DELIVERY_COMPANY_DOC / DRIVER_DOC) and attach them. ' +
      'An admin verifies the account; unverified drivers see no jobs.',
  })
  @ApiEnvelope(OtpSentDto, { status: HttpStatus.ACCEPTED })
  @ApiErrors(
    'VALIDATION_FAILED',
    'AUTH_IDENTIFIER_REQUIRED',
    'AUTH_CONSENT_REQUIRED',
    'OTP_RESEND_COOLDOWN',
  )
  register(@Body() dto: DeliveryRegisterDto, @ReqMeta() meta: RequestMeta) {
    const {
      account_type,
      company,
      vehicle_type,
      plate_number,
      license_number,
      ...base
    } = dto;
    return account_type === 'COMPANY'
      ? this.registration.registerDeliveryCompany(
          { ...base, company: company! },
          meta,
        )
      : this.registration.registerDriver(
          {
            ...base,
            vehicle_type: vehicle_type!,
            plate_number,
            license_number,
          },
          meta,
        );
  }
}

// ----------------------------------------------------------------- driver

@ApiTags('Delivery – driver')
@ApiBearerAuth()
@Roles('DRIVER')
@UseInterceptors(DriverPrivacyInterceptor)
@Controller('delivery')
export class DriverController {
  constructor(
    private readonly jobs: DriverJobsService,
    private readonly companies: DeliveryCompanyService,
  ) {}

  @Get('me')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @ApiOperation({
    summary: 'My driver profile, verification status, company, documents',
  })
  @ApiErrors('DRIVER_PROFILE_NOT_FOUND', ...AUTH)
  me(@CurrentUser() user: AuthUser) {
    return this.jobs.me(user);
  }

  @Post('me/documents')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @ApiOperation({
    summary: 'Attach a verification document (file purpose DRIVER_DOC)',
  })
  @ApiErrors('FILE_INVALID_FOR_USE', 'DRIVER_PROFILE_NOT_FOUND', ...AUTH)
  addDocument(@CurrentUser() user: AuthUser, @Body() dto: DriverDocumentDto) {
    return this.jobs.addDocument(user, dto);
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  @AllowAccountStatus('PENDING_VERIFICATION')
  @ApiOperation({
    summary: 'Join a delivery company with an invitation token',
    description:
      'The token must have been sent to your own phone / email. Not possible while carrying a parcel.',
  })
  @ApiErrors(
    'DELIVERY_INVITATION_INVALID',
    'DELIVERY_DRIVER_BUSY',
    'DRIVER_PROFILE_NOT_FOUND',
    ...AUTH,
  )
  acceptInvitation(
    @CurrentUser() user: AuthUser,
    @Body() dto: AcceptDriverInvitationDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.companies.acceptInvitation(user, dto.token, meta);
  }

  @Patch('me/availability')
  @ApiOperation({
    summary: 'Go online / offline (going online requires a verified driver)',
  })
  @ApiErrors(...DRV)
  availability(@CurrentUser() user: AuthUser, @Body() dto: AvailabilityDto) {
    return this.jobs.setAvailability(user, dto.is_available);
  }

  @Patch('me/location')
  @ApiOperation({
    summary: 'Update my position (throttled)',
    description:
      'At most one update every driver_location_min_interval_seconds (429 DELIVERY_LOCATION_THROTTLED with details.retry_after_seconds). ' +
      'Streamed to the patient (socket event delivery.location) only while a job is OUT_FOR_DELIVERY.',
  })
  @ApiErrors('DELIVERY_LOCATION_THROTTLED', ...DRV)
  location(@CurrentUser() user: AuthUser, @Body() dto: LocationDto) {
    return this.jobs.updateLocation(user, dto.latitude, dto.longitude);
  }

  @Get('jobs/available')
  @ApiOperation({
    summary: 'Job board',
    description:
      'AVAILABLE jobs near you (radius_km from your last location) or filtered by destination wilaya/commune. Shows the pickup pharmacy, ' +
      'the destination AREA only, fee and payout. The full drop-off address is revealed after assignment.',
  })
  @ApiErrors(...DRV)
  available(@CurrentUser() user: AuthUser, @Query() q: AvailableJobsQueryDto) {
    return this.jobs.available(user, q);
  }

  @Get('jobs/active')
  @ApiOperation({
    summary:
      'My current jobs (assigned, picked up, out for delivery, failed awaiting return)',
  })
  @ApiErrors('DRIVER_PROFILE_NOT_FOUND', ...AUTH)
  active(@CurrentUser() user: AuthUser) {
    return this.jobs.active(user);
  }

  @Get('jobs/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'One job: full details if assigned to me, public card if still available',
  })
  @ApiErrors(...JOB)
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.jobs.get(user, id);
  }

  @Post('jobs/:id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Accept a job (first come, first served)',
    description:
      'Atomic with an optimistic lock: when two drivers accept at once, exactly one wins; the other gets 409 DELIVERY_ALREADY_TAKEN.',
  })
  @ApiErrors('DELIVERY_ALREADY_TAKEN', 'DRIVER_NOT_AVAILABLE', ...JOB)
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.jobs.accept(user, id, meta);
  }

  @Post('jobs/:id/release')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'Give a job back before pickup (reason; delivery_max_releases_per_day)',
  })
  @ApiErrors('DELIVERY_RELEASE_LIMIT_REACHED', ...JOB)
  release(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReleaseJobDto,
  ) {
    return this.jobs.release(user, id, dto.reason);
  }

  @Post('jobs/:id/confirm-pickup')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'ASSIGNED → PICKED_UP with the pharmacy pickup code (locked after delivery_code_max_attempts)',
  })
  @ApiErrors('DELIVERY_CODE_INVALID', 'DELIVERY_CODE_LOCKED', ...JOB)
  confirmPickup(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PickupCodeDto,
  ) {
    return this.jobs.confirmPickup(user, id, dto.pickup_code);
  }

  @Post('jobs/:id/start')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'PICKED_UP → OUT_FOR_DELIVERY (optional ETA)' })
  @ApiErrors(...JOB)
  start(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: StartDeliveryDto,
  ) {
    return this.jobs.start(user, id, dto.eta_minutes);
  }

  @Post('jobs/:id/confirm-delivery')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'OUT_FOR_DELIVERY → DELIVERED with exactly one proof',
    description:
      'delivery_code (patient OTP, locked after delivery_code_max_attempts) | signature_file_id | photo_file_id + photo_has_no_face=true ' +
      '(files uploaded with purpose PROOF_OF_DELIVERY). DELIVERED cannot be set without a valid proof.',
  })
  @ApiErrors(
    'DELIVERY_PROOF_REQUIRED',
    'DELIVERY_CODE_INVALID',
    'DELIVERY_CODE_LOCKED',
    'FILE_INVALID_FOR_USE',
    ...JOB,
  )
  confirmDelivery(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ConfirmDeliveryDto,
  ) {
    return this.jobs.confirmDelivery(user, id, dto);
  }

  @Post('jobs/:id/fail')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'PICKED_UP / OUT_FOR_DELIVERY → FAILED (reason, attempts); then bring the parcel back',
  })
  @ApiErrors(...JOB)
  fail(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: FailDeliveryDto,
  ) {
    return this.jobs.fail(user, id, dto);
  }

  @Post('jobs/:id/confirm-return')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary:
      'I brought the failed parcel back to the pharmacy (the pharmacy then confirms receipt)',
  })
  @ApiErrors(
    'DELIVERY_NOT_FOUND',
    'DELIVERY_INVALID_TRANSITION',
    'DRIVER_PROFILE_NOT_FOUND',
    ...AUTH,
  )
  confirmReturn(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.jobs.confirmReturn(user, id);
  }

  @Get('history')
  @ApiOperation({
    summary: 'My finished jobs (delivered, failed, returned, cancelled)',
  })
  @ApiErrors('DRIVER_PROFILE_NOT_FOUND', ...AUTH)
  history(@CurrentUser() user: AuthUser, @Query() q: DeliveryHistoryQueryDto) {
    return this.jobs.history(user, q);
  }

  @Get('earnings')
  @ApiOperation({ summary: 'Payouts of delivered jobs per day (records only)' })
  @ApiErrors('DRIVER_PROFILE_NOT_FOUND', ...AUTH)
  earnings(@CurrentUser() user: AuthUser, @Query() q: PeriodQueryDto) {
    return this.jobs.earnings(user, q);
  }
}

// ---------------------------------------------------------------- company

@ApiTags('Delivery – company')
@ApiBearerAuth()
@Roles('DELIVERY_COMPANY_ADMIN')
@UseInterceptors(DriverPrivacyInterceptor)
@Controller('delivery/company')
export class DeliveryCompanyController {
  constructor(private readonly companies: DeliveryCompanyService) {}

  @Get()
  @AllowAccountStatus('PENDING_VERIFICATION')
  @ApiOperation({
    summary: 'My company profile, verification status and documents',
  })
  @ApiErrors('DELIVERY_COMPANY_NOT_FOUND', ...AUTH)
  me(@CurrentUser() user: AuthUser) {
    return this.companies.me(user);
  }

  @Post('documents')
  @AllowAccountStatus('PENDING_VERIFICATION')
  @ApiOperation({
    summary:
      'Attach a verification document (file purpose DELIVERY_COMPANY_DOC)',
  })
  @ApiErrors('FILE_INVALID_FOR_USE', 'DELIVERY_COMPANY_NOT_FOUND', ...AUTH)
  addDocument(@CurrentUser() user: AuthUser, @Body() dto: CompanyDocumentDto) {
    return this.companies.addDocument(user, dto);
  }

  @Get('drivers')
  @ApiOperation({ summary: 'Drivers of my company' })
  @ApiErrors('DELIVERY_COMPANY_NOT_FOUND', ...AUTH)
  drivers(@CurrentUser() user: AuthUser, @Query() q: CompanyDriversQueryDto) {
    return this.companies.drivers(user, q);
  }

  @Delete('drivers/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Remove a driver from my company (not while carrying a parcel)',
  })
  @ApiErrors(
    'DELIVERY_DRIVER_NOT_FOUND',
    'DELIVERY_DRIVER_BUSY',
    'DELIVERY_COMPANY_NOT_FOUND',
    ...AUTH,
  )
  removeDriver(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.companies.removeDriver(user, id, meta);
  }

  @Post('invitations')
  @ApiOperation({
    summary: 'Invite a driver by phone or email (company must be VERIFIED)',
  })
  @ApiErrors(
    'AUTH_IDENTIFIER_REQUIRED',
    'DELIVERY_COMPANY_NOT_VERIFIED',
    'DELIVERY_COMPANY_NOT_FOUND',
    ...AUTH,
  )
  invite(
    @CurrentUser() user: AuthUser,
    @Body() dto: InviteDriverDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.companies.invite(user, dto, meta);
  }

  @Get('invitations')
  @ApiOperation({ summary: 'Driver invitations of my company' })
  @ApiErrors('DELIVERY_COMPANY_NOT_FOUND', ...AUTH)
  invitations(@CurrentUser() user: AuthUser, @Query() q: PaginationQueryDto) {
    return this.companies.invitations(user, q);
  }

  @Delete('invitations/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  @ApiErrors(
    'DELIVERY_INVITATION_INVALID',
    'DELIVERY_COMPANY_NOT_FOUND',
    ...AUTH,
  )
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.companies.revokeInvitation(user, id);
  }

  @Get('reports')
  @ApiOperation({
    summary:
      'Activity report: volumes by status, success rate, fees, payouts, per driver',
  })
  @ApiErrors('VALIDATION_FAILED', 'DELIVERY_COMPANY_NOT_FOUND', ...AUTH)
  reports(@CurrentUser() user: AuthUser, @Query() q: PeriodQueryDto) {
    return this.companies.reports(user, q);
  }
}

// ---------------------------------------------------------------- patient

@ApiTags('Orders (patient)')
@ApiBearerAuth()
@Roles('PATIENT')
@Controller('orders/:id/delivery')
export class PatientDeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get()
  @ApiParam({ name: 'id', format: 'uuid', description: 'Order id' })
  @ApiOperation({
    summary: 'Track my delivery',
    description:
      'Status, driver first name and vehicle, ETA; live_location only while OUT_FOR_DELIVERY.',
  })
  @ApiErrors('ORDER_NOT_FOUND', 'DELIVERY_NOT_FOUND', ...AUTH)
  track(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.delivery.patientView(user, id);
  }

  @Post('code')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid', description: 'Order id' })
  @ApiOperation({
    summary:
      'Get a new delivery code to give the driver (shown once; resets attempts)',
  })
  @ApiErrors(
    'ORDER_NOT_FOUND',
    'DELIVERY_NOT_FOUND',
    'DELIVERY_INVALID_TRANSITION',
    ...AUTH,
  )
  code(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.delivery.regenerateDeliveryCode(user, id);
  }
}

// --------------------------------------------------------------- pharmacy

@ApiTags('Pharmacy – orders')
@ApiBearerAuth()
@Roles('PHARMACY_OWNER', 'PHARMACIST', 'PHARMACY_ASSISTANT')
@Controller('pharmacy/orders/:id/delivery')
export class PharmacyDeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get()
  @MyPharmacy()
  @ApiParam({ name: 'id', format: 'uuid', description: 'Order id' })
  @ApiOperation({
    summary:
      'Delivery of one of my orders (driver first name, vehicle, plate, timestamps)',
  })
  @ApiErrors('ORDER_NOT_FOUND', 'DELIVERY_NOT_FOUND', ...PH)
  view(
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.delivery.pharmacyView(ph, id);
  }

  @Post('pickup-code')
  @HttpCode(HttpStatus.OK)
  @MyPharmacy()
  @ApiParam({ name: 'id', format: 'uuid', description: 'Order id' })
  @ApiOperation({
    summary: 'New pickup code to show the driver (shown once; resets attempts)',
  })
  @ApiErrors(
    'ORDER_NOT_FOUND',
    'DELIVERY_NOT_FOUND',
    'DELIVERY_INVALID_TRANSITION',
    ...PH,
  )
  pickupCode(
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.delivery.regeneratePickupCode(ph, id);
  }

  @Post('confirm-return')
  @HttpCode(HttpStatus.OK)
  @MyPharmacy()
  @ApiParam({ name: 'id', format: 'uuid', description: 'Order id' })
  @ApiOperation({
    summary:
      'Confirm the failed parcel is back: delivery RETURNED, order FAILED → REFUND_PENDING (automatic refund request)',
  })
  @ApiErrors(
    'ORDER_NOT_FOUND',
    'DELIVERY_NOT_FOUND',
    'DELIVERY_INVALID_TRANSITION',
    'ORDER_INVALID_TRANSITION',
    ...PH,
  )
  confirmReturn(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.delivery.confirmReturnByPharmacy(user, ph, id);
  }
}
