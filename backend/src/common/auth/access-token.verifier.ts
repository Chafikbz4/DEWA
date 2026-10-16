import { Inject, Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import { Database, DRIZZLE } from '../../database/database.module';
import { sessions, users } from '../../database/schema';
import { AppException } from '../errors/app.exception';
import type { AuthUser } from './auth-user';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  role: string;
  typ: 'access';
}

/**
 * Verifies an access token AND that its session is still alive (used by the
 * HTTP guard and the WebSocket gateway), so logout / suspension / role
 * changes take effect immediately.
 */
@Injectable()
export class AccessTokenVerifier {
  constructor(
    private readonly jwt: JwtService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async verify(token: string): Promise<AuthUser> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch (err) {
      throw new AppException(
        err instanceof TokenExpiredError
          ? 'AUTH_TOKEN_EXPIRED'
          : 'AUTH_TOKEN_INVALID',
      );
    }
    if (payload.typ !== 'access' || !payload.sid || !payload.sub) {
      throw new AppException('AUTH_TOKEN_INVALID');
    }

    const [row] = await this.db
      .select({
        id: users.id,
        role: users.role,
        status: users.status,
        deletedAt: users.deletedAt,
        preferredLanguage: users.preferredLanguage,
        mfaEnabled: users.mfaEnabled,
        revokedAt: sessions.revokedAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(eq(sessions.id, payload.sid), eq(sessions.userId, payload.sub)),
      )
      .limit(1);

    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw new AppException('AUTH_SESSION_REVOKED');
    }
    return {
      id: row.id,
      role: row.role,
      status: row.deletedAt ? 'DELETED' : row.status,
      sessionId: payload.sid,
      preferredLanguage: row.preferredLanguage,
      mfaEnabled: row.mfaEnabled,
    };
  }
}
