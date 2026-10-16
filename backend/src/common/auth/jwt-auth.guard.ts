import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { and, eq } from 'drizzle-orm';
import { Request } from 'express';
import { Database, DRIZZLE } from '../../database/database.module';
import { sessions, users } from '../../database/schema';
import { AppException } from '../errors/app.exception';
import { IS_PUBLIC_KEY, OPTIONAL_AUTH_KEY } from './decorators';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  role: string;
  typ: 'access';
}

/**
 * Verifies the Bearer access token AND that its session is still alive, so
 * logout / suspension / role changes take effect immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (isPublic) {
      const optional = this.reflector.getAllAndOverride<boolean>(
        OPTIONAL_AUTH_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (!optional || !header) return true;
    }

    if (!header?.startsWith('Bearer '))
      throw new AppException('AUTH_TOKEN_MISSING');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(header.slice(7));
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

    req.user = {
      id: row.id,
      role: row.role,
      status: row.deletedAt ? 'DELETED' : row.status,
      sessionId: payload.sid,
      preferredLanguage: row.preferredLanguage,
      mfaEnabled: row.mfaEnabled,
    };
    return true;
  }
}
