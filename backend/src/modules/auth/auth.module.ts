import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthController } from './controllers/auth.controller';
import {
  DevicesController,
  MfaController,
  OtpController,
  PasswordController,
} from './controllers/account-security.controller';
import { RegistrationController } from './controllers/registration.controller';
import { AuthService } from './services/auth.service';
import { DevicesService } from './services/devices.service';
import { MfaService } from './services/mfa.service';
import { OtpService } from './services/otp.service';
import { RegistrationService } from './services/registration.service';
import { TokenService } from './services/token.service';

@Module({
  imports: [UsersModule],
  controllers: [
    AuthController,
    RegistrationController,
    OtpController,
    PasswordController,
    MfaController,
    DevicesController,
  ],
  providers: [
    AuthService,
    RegistrationService,
    TokenService,
    OtpService,
    MfaService,
    DevicesService,
  ],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
