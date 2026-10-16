import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, isNull, SQL } from 'drizzle-orm';
import { Request } from 'express';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  addresses,
  deliveries,
  dependants,
  devices,
  drivers,
  orders,
  requests,
  sessions,
} from '../../database/schema';
import { AppException } from '../errors/app.exception';

const OWNERSHIP_KEY = 'auth:ownership';

export type OwnedResourceKind =
  | 'address'
  | 'dependant'
  | 'request'
  | 'order'
  | 'device'
  | 'session'
  | 'delivery';

type OwnershipCheck = (
  db: Database,
  id: string,
  userId: string,
) => Promise<boolean>;

const exists = async (q: Promise<unknown[]>) => (await q).length > 0;

/**
 * One resolver per resource: returns true only when the resource exists AND
 * belongs to the user (patients own their data; drivers only see deliveries
 * assigned to them).
 */
const CHECKS: Record<OwnedResourceKind, OwnershipCheck> = {
  address: (db, id, userId) =>
    exists(
      db
        .select({ id: addresses.id })
        .from(addresses)
        .where(
          and(
            eq(addresses.id, id),
            eq(addresses.userId, userId),
            isNull(addresses.deletedAt),
          ),
        )
        .limit(1),
    ),
  dependant: (db, id, userId) =>
    exists(
      db
        .select({ id: dependants.id })
        .from(dependants)
        .where(
          and(
            eq(dependants.id, id),
            eq(dependants.patientUserId, userId),
            isNull(dependants.deletedAt),
          ),
        )
        .limit(1),
    ),
  request: (db, id, userId) =>
    exists(
      db
        .select({ id: requests.id })
        .from(requests)
        .where(and(eq(requests.id, id), eq(requests.patientUserId, userId)))
        .limit(1),
    ),
  order: (db, id, userId) =>
    exists(
      db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.patientUserId, userId)))
        .limit(1),
    ),
  device: (db, id, userId) =>
    exists(
      db
        .select({ id: devices.id })
        .from(devices)
        .where(
          and(
            eq(devices.id, id),
            eq(devices.userId, userId),
            isNull(devices.revokedAt),
          ),
        )
        .limit(1),
    ),
  session: (db, id, userId) =>
    exists(
      db
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
        .limit(1),
    ),
  delivery: (db, id, userId) =>
    exists(
      db
        .select({ id: deliveries.id })
        .from(deliveries)
        .innerJoin(drivers, eq(drivers.id, deliveries.driverId))
        .where(and(eq(deliveries.id, id), eq(drivers.userId, userId)) as SQL)
        .limit(1),
    ),
};

/**
 * @OwnsResource('address') – the `:id` param must reference a resource owned
 * by the current user. Non-owned and non-existent resources both return
 * NOT_FOUND so ids cannot be probed.
 */
export const OwnsResource = (kind: OwnedResourceKind, param = 'id') =>
  applyDecorators(
    SetMetadata(OWNERSHIP_KEY, { kind, param }),
    UseGuards(OwnershipGuard),
  );

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.get<{ kind: OwnedResourceKind; param: string }>(
      OWNERSHIP_KEY,
      context.getHandler(),
    );
    if (!meta) return true;
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.user) throw new AppException('UNAUTHORIZED');
    const raw = req.params[meta.param];
    const id = typeof raw === 'string' ? raw : undefined;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id))
      throw new AppException('NOT_FOUND');
    const owned = await CHECKS[meta.kind](this.db, id, req.user.id);
    if (!owned) throw new AppException('NOT_FOUND');
    return true;
  }
}
