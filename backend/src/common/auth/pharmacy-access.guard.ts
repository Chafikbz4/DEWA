import {
  applyDecorators,
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import { Request } from 'express';
import { Database, DRIZZLE } from '../../database/database.module';
import { pharmacies, pharmacyStaff, StaffRole } from '../../database/schema';
import { AppException } from '../errors/app.exception';
import type { PharmacyContext } from './auth-user';

const PHARMACY_ACCESS_KEY = 'auth:pharmacyAccess';

export interface PharmacyAccessOptions {
  /** Route param holding the pharmacy id. Default "id". */
  param?: string;
  /** Allowed staff roles. Default: any active staff member. */
  staffRoles?: StaffRole[];
  /** Pharmacy features require VERIFIED status (default true). */
  requireVerified?: boolean;
  /** Resolve the pharmacy from the user (a staff member works for one pharmacy) instead of a route param. */
  fromUser?: boolean;
}

/**
 * Pharmacy staff can only act on THEIR pharmacy, with the right staff role,
 * and (by default) only once the pharmacy is VERIFIED.
 */
export const PharmacyAccess = (options: PharmacyAccessOptions = {}) =>
  applyDecorators(
    SetMetadata(PHARMACY_ACCESS_KEY, options),
    UseGuards(PharmacyAccessGuard),
  );

@Injectable()
export class PharmacyAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const opts =
      this.reflector.get<PharmacyAccessOptions>(
        PHARMACY_ACCESS_KEY,
        context.getHandler(),
      ) ?? {};
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user;
    if (!user) throw new AppException('UNAUTHORIZED');

    const raw = opts.fromUser ? undefined : req.params[opts.param ?? 'id'];
    const pharmacyId = typeof raw === 'string' ? raw : undefined;
    if (
      !opts.fromUser &&
      (!pharmacyId || !/^[0-9a-f-]{36}$/i.test(pharmacyId))
    ) {
      throw new AppException('PHARMACY_NOT_FOUND');
    }

    const [row] = await this.db
      .select({
        id: pharmacies.id,
        status: pharmacies.status,
        staffRole: pharmacyStaff.staffRole,
      })
      .from(pharmacyStaff)
      .innerJoin(pharmacies, eq(pharmacies.id, pharmacyStaff.pharmacyId))
      .where(
        and(
          ...(pharmacyId ? [eq(pharmacyStaff.pharmacyId, pharmacyId)] : []),
          eq(pharmacyStaff.userId, user.id),
          eq(pharmacyStaff.isActive, true),
        ),
      )
      .limit(1);

    if (!row) throw new AppException('PHARMACY_ACCESS_DENIED');
    if (opts.staffRoles?.length && !opts.staffRoles.includes(row.staffRole)) {
      throw new AppException('PHARMACY_ACCESS_DENIED');
    }
    if ((opts.requireVerified ?? true) && row.status !== 'VERIFIED') {
      throw new AppException('PHARMACY_NOT_VERIFIED');
    }
    req.pharmacy = row;
    return true;
  }
}

/** Pharmacy of the current staff member (routes under /pharmacy/...). */
export const MyPharmacy = (
  options: Omit<PharmacyAccessOptions, 'fromUser' | 'param'> = {},
) => PharmacyAccess({ ...options, fromUser: true });

/** The pharmacy resolved by PharmacyAccess / MyPharmacy. */
export const CurrentPharmacy = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): PharmacyContext =>
    ctx.switchToHttp().getRequest<Request>().pharmacy as PharmacyContext,
);
