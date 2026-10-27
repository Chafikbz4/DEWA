import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, ReqMeta, RequestMeta } from '../../../common/auth/decorators';
import { ApiEnvelope, ApiErrors } from '../../../common/swagger/api-responses';
import { LoginResponseDto, OtpSentDto } from '../dto/auth.dto';
import {
  InvitationPreviewDto,
  InvitationPreviewResponseDto,
  RegisterDeliveryCompanyDto,
  RegisterDriverDto,
  RegisterPatientDto,
  RegisterPharmacyDto,
  RegisterStaffDto,
} from '../dto/register.dto';
import { RegistrationService } from '../services/registration.service';

const GENERIC =
  'Always answers 202 with a masked target, whether or not the email/phone is already registered (no enumeration). ' +
  'A 6-digit code (purpose REGISTER) is sent to the email (or phone if no email). Complete with POST /auth/otp/verify.';

@ApiTags('Auth – registration')
@Public()
@Controller('auth')
export class RegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  @Post('register/patient')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Register a patient',
    description: `${GENERIC} The account becomes ACTIVE once the code is verified.`,
  })
  @ApiEnvelope(OtpSentDto, { status: HttpStatus.ACCEPTED })
  @ApiErrors(
    'AUTH_IDENTIFIER_REQUIRED',
    'AUTH_CONSENT_REQUIRED',
    'AUTH_CONSENT_VERSION_OUTDATED',
    'OTP_RESEND_COOLDOWN',
  )
  patient(@Body() dto: RegisterPatientDto, @ReqMeta() meta: RequestMeta) {
    return this.registration.registerPatient(dto, meta);
  }

  @Post('register/pharmacy')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Register a pharmacy owner + pharmacy (DRAFT)',
    description: `${GENERIC} The pharmacy becomes active after the owner verifies the registration code.`,
  })
  @ApiEnvelope(OtpSentDto, { status: HttpStatus.ACCEPTED })
  @ApiErrors(
    'AUTH_IDENTIFIER_REQUIRED',
    'AUTH_CONSENT_REQUIRED',
    'AUTH_CONSENT_VERSION_OUTDATED',
    'GEO_INVALID_COMMUNE',
    'PHARMACY_AUTHORIZATION_NUMBER_TAKEN',
    'OTP_RESEND_COOLDOWN',
  )
  pharmacy(@Body() dto: RegisterPharmacyDto, @ReqMeta() meta: RequestMeta) {
    return this.registration.registerPharmacy(dto, meta);
  }

  @Post('register/delivery-company')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Register a delivery company admin + company',
    description: `${GENERIC} The account and company stay PENDING_VERIFICATION until an admin approves them.`,
  })
  @ApiEnvelope(OtpSentDto, { status: HttpStatus.ACCEPTED })
  @ApiErrors(
    'AUTH_IDENTIFIER_REQUIRED',
    'AUTH_CONSENT_REQUIRED',
    'AUTH_CONSENT_VERSION_OUTDATED',
    'OTP_RESEND_COOLDOWN',
  )
  deliveryCompany(
    @Body() dto: RegisterDeliveryCompanyDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.registration.registerDeliveryCompany(dto, meta);
  }

  @Post('register/driver')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Register an independent driver',
    description: `${GENERIC} The driver stays PENDING_VERIFICATION until an admin approves the documents.`,
  })
  @ApiEnvelope(OtpSentDto, { status: HttpStatus.ACCEPTED })
  @ApiErrors(
    'AUTH_IDENTIFIER_REQUIRED',
    'AUTH_CONSENT_REQUIRED',
    'AUTH_CONSENT_VERSION_OUTDATED',
    'OTP_RESEND_COOLDOWN',
  )
  driver(@Body() dto: RegisterDriverDto, @ReqMeta() meta: RequestMeta) {
    return this.registration.registerDriver(dto, meta);
  }

  @Post('register/staff')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Accept a pharmacy staff invitation (creates the account)',
    description:
      'The email/phone comes from the invitation and is marked verified. Returns tokens immediately; the account ' +
      'stays PENDING_VERIFICATION until an admin approves it.',
  })
  @ApiEnvelope(LoginResponseDto, { status: HttpStatus.CREATED })
  @ApiErrors(
    'INVITATION_INVALID',
    'INVITATION_EXPIRED',
    'IDENTIFIER_ALREADY_USED',
    'AUTH_CONSENT_REQUIRED',
    'AUTH_CONSENT_VERSION_OUTDATED',
  )
  staff(@Body() dto: RegisterStaffDto, @ReqMeta() meta: RequestMeta) {
    return this.registration.registerStaff(dto, meta);
  }

  @Post('invitations/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Show who invited you before you register',
    description: 'Returns pharmacy name, role and masked target.',
  })
  @ApiEnvelope(InvitationPreviewResponseDto)
  @ApiErrors('INVITATION_INVALID', 'INVITATION_EXPIRED')
  preview(@Body() dto: InvitationPreviewDto) {
    return this.registration.previewInvitation(dto.invitation_token);
  }
}
