import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { Request } from 'express';
import type { AccountStatus, Role } from '../../database/schema';
import { I18nService, Lang } from '../i18n/i18n.service';
import type { AuthUser } from './auth-user';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';
export const ALLOWED_STATUSES_KEY = 'auth:allowedStatuses';
export const OPTIONAL_AUTH_KEY = 'auth:optional';

/** Route needs no access token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Public route that ALSO authenticates when a Bearer token is sent
 * (an invalid token is still rejected). Use together with @Public().
 */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH_KEY, true);

/** Restrict a route to the given roles (least privilege: list explicitly). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * By default only ACTIVE accounts pass. Use this to additionally allow e.g.
 * PENDING_VERIFICATION accounts on onboarding/self-service routes.
 */
export const AllowAccountStatus = (...statuses: AccountStatus[]) =>
  SetMetadata(ALLOWED_STATUSES_KEY, statuses);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.user as AuthUser;
  },
);

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  deviceId: string | null;
}

/** Client IP / user agent for audit logs and sessions. */
export const ReqMeta = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestMeta => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const ua = req.headers['user-agent'];
    const device = req.headers['x-device-id'];
    return {
      ip: req.ip ?? null,
      userAgent: ua ? ua.slice(0, 512) : null,
      deviceId: typeof device === 'string' ? device.slice(0, 128) : null,
    };
  },
);

const langResolver = new I18nService();
/** Language from Accept-Language (ar | fr, default fr). */
export const ReqLang = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Lang =>
    langResolver.resolveLang(
      ctx.switchToHttp().getRequest<Request>().headers['accept-language'],
    ),
);
