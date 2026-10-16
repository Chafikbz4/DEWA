import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Request } from 'express';
import Redis from 'ioredis';
import { normalizeIdentifier } from '../utils/identifier';

const isAuthRoute = (ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<Request>().path.startsWith('/auth');

/** Account key for per-account limits: the identifier the client is targeting. */
export function accountKey(req: Request): string | null {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const raw = [body.identifier, body.target, body.email, body.phone].find(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  if (raw) {
    const id = normalizeIdentifier(raw);
    return `acct:${id ? id.value : raw.toLowerCase().slice(0, 254)}`;
  }
  return req.user ? `user:${req.user.id}` : null;
}

/**
 * Three limits:
 *  - global:        every route, per IP
 *  - auth_ip:       /auth/* per IP (stricter)
 *  - auth_account:  /auth/* per targeted account (email/phone/user), 15-min window
 * Uses Redis when REDIS_URL is set (multi-instance safe), memory otherwise.
 */
export function throttlerOptionsFactory(
  config: ConfigService,
): ThrottlerModuleOptions {
  const redisUrl = config.get<string>('REDIS_URL');
  let storage: ThrottlerStorage | undefined;
  if (redisUrl) {
    storage = new ThrottlerStorageRedisService(
      new Redis(redisUrl, { lazyConnect: false }),
    );
  }
  return {
    storage,
    errorMessage: 'RATE_LIMITED',
    throttlers: [
      {
        name: 'global',
        ttl: 60_000,
        limit: config.get<number>('RATE_LIMIT_GLOBAL_PER_MINUTE', 120),
      },
      {
        name: 'auth_ip',
        ttl: 60_000,
        limit: config.get<number>('RATE_LIMIT_AUTH_IP_PER_MINUTE', 20),
        skipIf: (ctx) => !isAuthRoute(ctx),
      },
      {
        name: 'auth_account',
        ttl: 15 * 60_000,
        limit: config.get<number>('RATE_LIMIT_AUTH_ACCOUNT_PER_15_MIN', 10),
        skipIf: (ctx) =>
          !isAuthRoute(ctx) ||
          !accountKey(ctx.switchToHttp().getRequest<Request>()),
        getTracker: (req) => accountKey(req as Request) ?? 'none',
      },
    ],
  };
}

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return `ip:${(req as unknown as Request).ip ?? 'unknown'}`;
  }
}
