import { Global, Module } from '@nestjs/common';
import { AuditService } from '../modules/audit/audit.service';
import { MessageSender } from '../modules/messaging-providers/message-sender.service';
import {
  ConsoleEmailProvider,
  ConsoleSmsProvider,
  EMAIL_PROVIDER,
  SMS_PROVIDER,
} from '../modules/messaging-providers/providers';
import { CryptoService } from './crypto/crypto.service';
import { I18nService } from './i18n/i18n.service';

/** Cross-cutting services available everywhere. */
@Global()
@Module({
  providers: [
    CryptoService,
    I18nService,
    AuditService,
    MessageSender,
    // Swap these for real providers via env (SMS_PROVIDER / EMAIL_PROVIDER).
    { provide: SMS_PROVIDER, useClass: ConsoleSmsProvider },
    { provide: EMAIL_PROVIDER, useClass: ConsoleEmailProvider },
  ],
  exports: [
    CryptoService,
    I18nService,
    AuditService,
    MessageSender,
    SMS_PROVIDER,
    EMAIL_PROVIDER,
  ],
})
export class CommonModule {}
