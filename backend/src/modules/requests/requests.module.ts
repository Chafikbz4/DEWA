import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PatientsModule } from '../patients/patients.module';
import { EligibilityService } from './eligibility.service';
import { MatchingService } from './matching.service';
import {
  CNAS_VERIFICATION_PROVIDER,
  UnavailableCnasProvider,
} from './providers/cnas.provider';
import { MockOcrProvider, OCR_PROVIDER } from './providers/ocr.provider';
import { RequestLifecycleService } from './request-lifecycle.service';
import { RequestsBackground } from './requests.background';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [PatientsModule],
  controllers: [RequestsController],
  providers: [
    RequestsService,
    MatchingService,
    EligibilityService,
    RequestLifecycleService,
    RequestsBackground,
    {
      provide: OCR_PROVIDER,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        c.get('OCR_PROVIDER') === 'none' ? null : new MockOcrProvider(),
    },
    // Replace only with an official CNAS integration.
    { provide: CNAS_VERIFICATION_PROVIDER, useClass: UnavailableCnasProvider },
  ],
  exports: [
    RequestsService,
    EligibilityService,
    RequestLifecycleService,
    MatchingService,
  ],
})
export class RequestsModule {}
