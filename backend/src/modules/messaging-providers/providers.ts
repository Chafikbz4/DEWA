import { Injectable, Logger } from '@nestjs/common';
import { maskIdentifier } from '../../common/utils/identifier';

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

/** Implement with a real gateway (e.g. a licensed Algerian SMS aggregator). */
export interface ISmsProvider {
  send(to: string, message: string): Promise<void>;
}

export interface IEmailProvider {
  send(to: string, subject: string, body: string): Promise<void>;
}

export interface OutboxMessage {
  channel: 'SMS' | 'EMAIL';
  to: string;
  subject?: string;
  body: string;
  at: Date;
}

/**
 * DEVELOPMENT/TEST ONLY. Prints messages to the console and keeps the last
 * 200 in memory (used by e2e tests to read OTPs). Refused in production by
 * env validation.
 */
abstract class ConsoleOutbox {
  protected readonly logger = new Logger('MockMessaging');
  readonly outbox: OutboxMessage[] = [];

  protected push(msg: OutboxMessage) {
    this.outbox.push(msg);
    if (this.outbox.length > 200) this.outbox.shift();
    if (process.env.NODE_ENV !== 'test') {
      const masked = maskIdentifier({
        type: msg.channel === 'SMS' ? 'PHONE' : 'EMAIL',
        value: msg.to,
      });
      this.logger.warn(
        `[${msg.channel} → ${masked}] ${msg.subject ? msg.subject + ' | ' : ''}${msg.body}`,
      );
    }
  }

  /** Test helper: last message sent to a recipient. */
  lastTo(to: string): OutboxMessage | undefined {
    return [...this.outbox].reverse().find((m) => m.to === to);
  }
}

@Injectable()
export class ConsoleSmsProvider extends ConsoleOutbox implements ISmsProvider {
  async send(to: string, message: string) {
    this.push({ channel: 'SMS', to, body: message, at: new Date() });
  }
}

@Injectable()
export class ConsoleEmailProvider
  extends ConsoleOutbox
  implements IEmailProvider
{
  async send(to: string, subject: string, body: string) {
    this.push({ channel: 'EMAIL', to, subject, body, at: new Date() });
  }
}

export const PUSH_PROVIDER = Symbol('PUSH_PROVIDER');

/** Implement with FCM / APNs. Payloads must never contain medical details. */
export interface IPushProvider {
  send(
    tokens: string[],
    title: string,
    body: string,
    data: Record<string, string>,
  ): Promise<void>;
}

export interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
  data: Record<string, string>;
  at: Date;
}

/** DEVELOPMENT/TEST push mock. `failNext` simulates provider outages. */
@Injectable()
export class MockPushProvider implements IPushProvider {
  private readonly logger = new Logger('MockPush');
  readonly outbox: PushMessage[] = [];
  /** Number of upcoming send() calls that will throw. */
  failNext = 0;

  async send(
    tokens: string[],
    title: string,
    body: string,
    data: Record<string, string>,
  ) {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('Mock push provider unavailable');
    }
    this.outbox.push({ tokens, title, body, data, at: new Date() });
    if (this.outbox.length > 200) this.outbox.shift();
    if (process.env.NODE_ENV !== 'test')
      this.logger.log(`[PUSH ×${tokens.length}] ${title} – ${body}`);
  }
}
