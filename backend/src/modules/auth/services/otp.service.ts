import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { AppException } from '../../../common/errors/app.exception';
import { Lang } from '../../../common/i18n/i18n.service';
import { NormalizedIdentifier } from '../../../common/utils/identifier';
import { Database, DRIZZLE } from '../../../database/database.module';
import { OtpPurpose, otpCodes } from '../../../database/schema';
import { MessageSender } from '../../messaging-providers/message-sender.service';

export interface IssueOtpInput {
  target: NormalizedIdentifier;
  purpose: OtpPurpose;
  /** NULL → a decoy code is stored (keeps cooldown identical) but nothing is sent. */
  userId: string | null;
  lang: Lang;
  /** Send "you already have an account" instead of a code. */
  notifyAccountExists?: boolean;
}

/**
 * 6-digit OTPs: HMAC-hashed (bound to target+purpose), 5 min expiry,
 * max 5 attempts, resend cooldown. Identical observable behaviour whether or
 * not an account exists (no user enumeration).
 */
@Injectable()
export class OtpService {
  private readonly ttl: number;
  private readonly maxAttempts: number;
  private readonly cooldown: number;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly crypto: CryptoService,
    private readonly sender: MessageSender,
    config: ConfigService,
  ) {
    this.ttl = config.get<number>('OTP_TTL_SECONDS', 300);
    this.maxAttempts = config.get<number>('OTP_MAX_ATTEMPTS', 5);
    this.cooldown = config.get<number>('OTP_RESEND_COOLDOWN_SECONDS', 60);
  }

  get ttlSeconds() {
    return this.ttl;
  }

  private hash(target: string, purpose: OtpPurpose, code: string) {
    return this.crypto.hmac(`${target}|${purpose}|${code}`);
  }

  async issue(input: IssueOtpInput): Promise<{ expiresIn: number }> {
    const { target, purpose } = input;
    const [last] = await this.db
      .select({ createdAt: otpCodes.createdAt })
      .from(otpCodes)
      .where(
        and(eq(otpCodes.target, target.value), eq(otpCodes.purpose, purpose)),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);
    if (last) {
      const elapsed = (Date.now() - last.createdAt.getTime()) / 1000;
      if (elapsed < this.cooldown) {
        throw new AppException('OTP_RESEND_COOLDOWN', null, {
          seconds: Math.ceil(this.cooldown - elapsed),
        });
      }
    }

    const code = this.crypto.numericCode(6);
    const now = new Date();
    await this.db.transaction(async (tx) => {
      // Only the newest code is valid.
      await tx
        .update(otpCodes)
        .set({ expiresAt: now })
        .where(
          and(
            eq(otpCodes.target, target.value),
            eq(otpCodes.purpose, purpose),
            isNull(otpCodes.consumedAt),
            gt(otpCodes.expiresAt, now),
          ),
        );
      await tx.insert(otpCodes).values({
        userId: input.userId,
        target: target.value,
        targetType: target.type,
        purpose,
        codeHash: this.hash(target.value, purpose, code),
        expiresAt: new Date(now.getTime() + this.ttl * 1000),
      });
    });

    if (input.notifyAccountExists) {
      await this.sender.send(
        target.type,
        target.value,
        'account_exists',
        input.lang,
      );
    } else if (input.userId) {
      await this.sender.send(target.type, target.value, 'otp', input.lang, {
        code,
        minutes: Math.round(this.ttl / 60),
      });
    }
    return { expiresIn: this.ttl };
  }

  /** Verifies and consumes the latest code. Returns the user id it was issued for. */
  async verify(
    target: string,
    purpose: OtpPurpose,
    code: string,
  ): Promise<string> {
    const now = new Date();
    const [otp] = await this.db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.target, target),
          eq(otpCodes.purpose, purpose),
          isNull(otpCodes.consumedAt),
          gt(otpCodes.expiresAt, now),
        ),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);

    if (!otp) throw new AppException('OTP_INVALID');
    if (otp.attempts >= this.maxAttempts)
      throw new AppException('OTP_TOO_MANY_ATTEMPTS');

    if (!this.crypto.hmacEquals(`${target}|${purpose}|${code}`, otp.codeHash)) {
      const [updated] = await this.db
        .update(otpCodes)
        .set({ attempts: sql`${otpCodes.attempts} + 1` })
        .where(eq(otpCodes.id, otp.id))
        .returning({ attempts: otpCodes.attempts });
      throw new AppException(
        updated.attempts >= this.maxAttempts
          ? 'OTP_TOO_MANY_ATTEMPTS'
          : 'OTP_INVALID',
      );
    }

    const consumed = await this.db
      .update(otpCodes)
      .set({ consumedAt: now })
      .where(and(eq(otpCodes.id, otp.id), isNull(otpCodes.consumedAt)))
      .returning({ id: otpCodes.id });
    // Decoy codes (no user) can never succeed.
    if (!consumed.length || !otp.userId) throw new AppException('OTP_INVALID');
    return otp.userId;
  }
}
