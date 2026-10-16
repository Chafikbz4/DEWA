import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import type { AccountStatus } from '../../database/schema';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { ALLOWED_STATUSES_KEY } from './decorators';

const STATUS_ERRORS: Record<Exclude<AccountStatus, 'ACTIVE'>, ErrorCode> = {
  PENDING_VERIFICATION: 'ACCOUNT_PENDING_VERIFICATION',
  SUSPENDED: 'ACCOUNT_SUSPENDED',
  DELETED: 'ACCOUNT_DELETED',
};

/** Only ACTIVE accounts pass unless the route opts in with @AllowAccountStatus. */
@Injectable()
export class AccountStatusGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) return true; // public route

    const extra =
      this.reflector.getAllAndOverride<AccountStatus[]>(ALLOWED_STATUSES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    // Only PENDING_VERIFICATION can be opted in; SUSPENDED / DELETED never pass.
    const allowed = new Set<AccountStatus>([
      'ACTIVE',
      ...extra.filter((s) => s === 'PENDING_VERIFICATION'),
    ]);
    if (allowed.has(user.status)) return true;
    throw new AppException(
      STATUS_ERRORS[user.status as Exclude<AccountStatus, 'ACTIVE'>],
    );
  }
}
