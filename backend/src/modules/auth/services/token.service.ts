import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { AppException } from '../../../common/errors/app.exception';
import { Database, DbOrTx, DRIZZLE } from '../../../database/database.module';
import { Role, sessions } from '../../../database/schema';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
}

interface PurposeTokenPayload {
  sub: string;
  typ: 'mfa' | 'pwreset';
  /** mfa: true when the user must enrol MFA first. */
  setup?: boolean;
  /** pwreset: password version – token dies once the password changes. */
  pwv?: number;
}

/**
 * Access tokens: short-lived JWT bound to a session id.
 * Refresh tokens: opaque "<sessionId>.<secret>", only an HMAC of the secret is
 * stored; rotated on each use; all rotations share a family for reuse detection.
 */
@Injectable()
export class TokenService {
  private readonly accessTtl: number;
  private readonly refreshTtlMs: number;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly crypto: CryptoService,
    config: ConfigService,
  ) {
    this.accessTtl = config.get<number>('JWT_ACCESS_TTL_SECONDS', 900);
    this.refreshTtlMs =
      config.get<number>('REFRESH_TOKEN_TTL_DAYS', 30) * 86_400_000;
  }

  async issue(
    user: { id: string; role: Role },
    meta: ClientMeta,
    opts: { familyId?: string; deviceId?: string | null } = {},
    tx: DbOrTx = this.db,
  ): Promise<{ tokens: TokenPair; sessionId: string }> {
    const sessionId = randomUUID();
    const secret = this.crypto.randomToken(32);
    await tx.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      familyId: opts.familyId ?? randomUUID(),
      refreshTokenHash: this.crypto.hmac(secret),
      deviceId: opts.deviceId ?? null,
      ip: meta.ip,
      userAgent: meta.userAgent,
      expiresAt: new Date(Date.now() + this.refreshTtlMs),
      lastUsedAt: new Date(),
    });
    const access = await this.jwt.signAsync(
      { sub: user.id, sid: sessionId, role: user.role, typ: 'access' },
      { expiresIn: this.accessTtl },
    );
    return {
      sessionId,
      tokens: {
        access_token: access,
        refresh_token: `${sessionId}.${secret}`,
        token_type: 'Bearer',
        expires_in: this.accessTtl,
      },
    };
  }

  parseRefreshToken(
    token: string,
  ): { sessionId: string; secret: string } | null {
    const dot = token.indexOf('.');
    if (dot !== 36) return null;
    const sessionId = token.slice(0, dot);
    const secret = token.slice(dot + 1);
    if (!/^[0-9a-f-]{36}$/i.test(sessionId) || secret.length < 20) return null;
    return { sessionId, secret };
  }

  secretMatches(secret: string, storedHash: string) {
    return this.crypto.hmacEquals(secret, storedHash);
  }

  async revokeSession(sessionId: string, reason: string, tx: DbOrTx = this.db) {
    const res = await tx
      .update(sessions)
      .set({ revokedAt: new Date(), revokeReason: reason })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return res.length;
  }

  async revokeFamily(familyId: string, reason: string, tx: DbOrTx = this.db) {
    const res = await tx
      .update(sessions)
      .set({ revokedAt: new Date(), revokeReason: reason })
      .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return res.length;
  }

  async revokeAllForUser(
    userId: string,
    reason: string,
    opts: { exceptSessionId?: string } = {},
    tx: DbOrTx = this.db,
  ) {
    const conditions = [
      eq(sessions.userId, userId),
      isNull(sessions.revokedAt),
    ];
    if (opts.exceptSessionId)
      conditions.push(ne(sessions.id, opts.exceptSessionId));
    const res = await tx
      .update(sessions)
      .set({ revokedAt: new Date(), revokeReason: reason })
      .where(and(...conditions))
      .returning({ id: sessions.id });
    return res.length;
  }

  // ---- short-lived purpose tokens (MFA step, password reset) ----

  signMfaToken(userId: string, setupRequired: boolean) {
    return this.jwt.signAsync(
      {
        sub: userId,
        typ: 'mfa',
        setup: setupRequired,
      } satisfies PurposeTokenPayload,
      { expiresIn: 300 },
    );
  }

  async verifyMfaToken(
    token: string,
  ): Promise<{ userId: string; setup: boolean }> {
    const p = await this.verifyPurpose(token, 'mfa', 'MFA_TOKEN_INVALID');
    return { userId: p.sub, setup: !!p.setup };
  }

  signResetToken(userId: string, passwordChangedAt: Date | null) {
    return this.jwt.signAsync(
      {
        sub: userId,
        typ: 'pwreset',
        pwv: passwordChangedAt?.getTime() ?? 0,
      } satisfies PurposeTokenPayload,
      { expiresIn: 600 },
    );
  }

  async verifyResetToken(
    token: string,
  ): Promise<{ userId: string; pwv: number }> {
    const p = await this.verifyPurpose(token, 'pwreset', 'OTP_INVALID');
    return { userId: p.sub, pwv: p.pwv ?? 0 };
  }

  private async verifyPurpose(
    token: string,
    typ: PurposeTokenPayload['typ'],
    error: 'MFA_TOKEN_INVALID' | 'OTP_INVALID',
  ): Promise<PurposeTokenPayload> {
    try {
      const p = await this.jwt.verifyAsync<PurposeTokenPayload>(token);
      if (p.typ !== typ || !p.sub) throw new Error('wrong token type');
      return p;
    } catch {
      throw new AppException(error);
    }
  }
}
