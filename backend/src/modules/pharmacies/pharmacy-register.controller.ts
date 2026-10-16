import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public, ReqMeta, RequestMeta } from '../../common/auth/decorators';
import { ApiEnvelope, ApiErrors } from '../../common/swagger/api-responses';
import { OtpSentDto } from '../auth/dto/auth.dto';
import { RegisterPharmacyDto } from '../auth/dto/register.dto';
import { RegistrationService } from '../auth/services/registration.service';

@ApiTags('Pharmacies – public')
@Controller('pharmacies')
export class PharmacyRegisterController {
  constructor(private readonly registration: RegistrationService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Register a pharmacy (owner + pharmacy in PENDING_VERIFICATION)',
    description:
      'Same as POST /auth/register/pharmacy. Then: verify the OTP, log in, upload documents (purpose PHARMACY_DOC) and attach them ' +
      'with POST /pharmacy/documents. An admin reviews the documents; the pharmacy cannot receive requests until VERIFIED.',
  })
  @ApiEnvelope(OtpSentDto, { status: HttpStatus.ACCEPTED })
  @ApiErrors(
    'AUTH_IDENTIFIER_REQUIRED',
    'AUTH_CONSENT_REQUIRED',
    'GEO_INVALID_COMMUNE',
    'PHARMACY_AUTHORIZATION_NUMBER_TAKEN',
    'OTP_RESEND_COOLDOWN',
  )
  register(@Body() dto: RegisterPharmacyDto, @ReqMeta() meta: RequestMeta) {
    return this.registration.registerPharmacy(dto, meta);
  }
}
