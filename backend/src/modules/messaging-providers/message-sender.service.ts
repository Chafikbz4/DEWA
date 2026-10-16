import { Inject, Injectable } from '@nestjs/common';
import { I18nService, Lang } from '../../common/i18n/i18n.service';
import { IdentifierType } from '../../common/utils/identifier';
import {
  EMAIL_PROVIDER,
  IEmailProvider,
  ISmsProvider,
  SMS_PROVIDER,
} from './providers';

/** Sends a localized templated message to a phone or an email address. */
@Injectable()
export class MessageSender {
  constructor(
    @Inject(SMS_PROVIDER) private readonly sms: ISmsProvider,
    @Inject(EMAIL_PROVIDER) private readonly email: IEmailProvider,
    private readonly i18n: I18nService,
  ) {}

  async send(
    channel: IdentifierType,
    to: string,
    template: 'otp' | 'account_exists' | 'staff_invitation',
    lang: Lang,
    params?: Record<string, string | number>,
  ) {
    const body = this.i18n.t(`messages.${template}`, lang, params);
    if (channel === 'PHONE') return this.sms.send(to, body);
    return this.email.send(to, 'DEWA', body);
  }
}
