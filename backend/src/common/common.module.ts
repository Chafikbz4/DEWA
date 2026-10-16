import { Global, Module } from '@nestjs/common';
import { AuditService } from '../modules/audit/audit.service';
import { SensitiveAccessService } from '../modules/audit/sensitive-access.service';
import { JobQueueService } from '../modules/jobs/job-queue.service';
import { SettingsService } from '../modules/settings/settings.service';
import { MessageSender } from '../modules/messaging-providers/message-sender.service';
import {
  ConsoleEmailProvider,
  ConsoleSmsProvider,
  EMAIL_PROVIDER,
  SMS_PROVIDER,
} from '../modules/messaging-providers/providers';
import { ConfigService } from '@nestjs/config';
import {
  CryptoService,
  EnvKeyProvider,
  KEY_PROVIDER,
} from './crypto/crypto.service';
import { AccessTokenVerifier } from './auth/access-token.verifier';
import { UnitOfWork } from './events/unit-of-work';
import { I18nService } from './i18n/i18n.service';
import { PermissionsService } from './auth/permissions.guard';

/** Cross-cutting services available everywhere. */
@Global()
@Module({
  providers: [
    AccessTokenVerifier,
    // Swap for a KMS-backed IKeyProvider in production if available.
    {
      provide: KEY_PROVIDER,
      inject: [ConfigService],
      useFactory: (c: ConfigService) => new EnvKeyProvider(c),
    },
    CryptoService,
    UnitOfWork,
    SettingsService,
    JobQueueService,
    SensitiveAccessService,
    I18nService,
    AuditService,
    MessageSender,
    PermissionsService,
    // Swap these for real providers via env (SMS_PROVIDER / EMAIL_PROVIDER).
    { provide: SMS_PROVIDER, useClass: ConsoleSmsProvider },
    { provide: EMAIL_PROVIDER, useClass: ConsoleEmailProvider },
  ],
  exports: [
    AccessTokenVerifier,
    CryptoService,
    UnitOfWork,
    SettingsService,
    JobQueueService,
    SensitiveAccessService,
    I18nService,
    AuditService,
    MessageSender,
    PermissionsService,
    SMS_PROVIDER,
    EMAIL_PROVIDER,
  ],
})
export class CommonModule {}
