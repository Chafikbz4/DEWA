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
    summary: 'Register a pharmacy (owner + pharmacy activated after OTP)',
    description:
      'Same as POST /auth/register/pharmacy. After the owner verifies the OTP, the pharmacy can receive requests immediately.',
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
