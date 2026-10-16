import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import { AuthUser } from '../../../common/auth/auth-user';
import { RequestMeta } from '../../../common/auth/decorators';
import { AppException } from '../../../common/errors/app.exception';
import { Paginated } from '../../../common/http/envelope';
import { PaginationQueryDto } from '../../../common/http/pagination.dto';
import { Database, DbOrTx, DRIZZLE } from '../../../database/database.module';
import { devices, sessions, users } from '../../../database/schema';
import { AuditAction, AuditService } from '../../audit/audit.service';
import { DeviceDto, RegisterDeviceDto } from '../dto/auth.dto';

const present = (d: typeof devices.$inferSelect): DeviceDto => ({
  id: d.id,
  device_id: d.deviceIdentifier,
  platform: d.platform,
  biometric_enabled: d.biometricEnabled,
  app_version: d.appVersion,
  last_seen_at: d.lastSeenAt,
  created_at: d.createdAt,
});

/**
 * Biometric login = the app keeps a device-bound refresh token in the secure
 * enclave and unlocks it with OS biometrics. The server only stores a flag
 * and binds the session to the device; no biometric data ever reaches it.
 */
@Injectable()
export class DevicesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async register(
    user: AuthUser,
    dto: RegisterDeviceDto,
    meta: RequestMeta,
  ): Promise<DeviceDto> {
    return this.db.transaction(async (tx) => {
      const [device] = await tx
        .insert(devices)
        .values({
          userId: user.id,
          deviceIdentifier: dto.device_id,
          platform: dto.platform,
          pushToken: dto.push_token,
          appVersion: dto.app_version,
          biometricEnabled: dto.biometric_enabled,
          lastSeenAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [devices.userId, devices.deviceIdentifier],
          set: {
            platform: dto.platform,
            pushToken: dto.push_token ?? null,
            appVersion: dto.app_version ?? null,
            biometricEnabled: dto.biometric_enabled,
            lastSeenAt: new Date(),
            revokedAt: null,
          },
        })
        .returning();
      // Bind the current session (and its future rotations) to this device.
      await tx
        .update(sessions)
        .set({ deviceId: device.id })
        .where(eq(sessions.id, user.sessionId));
      await this.syncUserBiometricFlag(user.id, tx);
      await this.audit.log(
        {
          action: AuditAction.DEVICE_REGISTERED,
          actorUserId: user.id,
          actorRole: user.role,
          resourceType: 'device',
          resourceId: device.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: {
            platform: dto.platform,
            biometric_enabled: dto.biometric_enabled,
          },
        },
        tx,
      );
      return present(device);
    });
  }

  async list(user: AuthUser, q: PaginationQueryDto) {
    const where = and(eq(devices.userId, user.id), isNull(devices.revokedAt));
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(devices)
        .where(where)
        .orderBy(
          q.order === 'asc' ? devices.createdAt : desc(devices.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(devices).where(where),
    ]);
    return Paginated.of(rows.map(present), total, q.page, q.limit);
  }

  /** Disables biometrics on the device and signs out every session bound to it. */
  async remove(user: AuthUser, deviceRowId: string, meta: RequestMeta) {
    return this.db.transaction(async (tx) => {
      const [device] = await tx
        .update(devices)
        .set({
          revokedAt: new Date(),
          biometricEnabled: false,
          pushToken: null,
        })
        .where(
          and(
            eq(devices.id, deviceRowId),
            eq(devices.userId, user.id),
            isNull(devices.revokedAt),
          ),
        )
        .returning();
      if (!device) throw new AppException('DEVICE_NOT_FOUND');
      const revoked = await tx
        .update(sessions)
        .set({ revokedAt: new Date(), revokeReason: 'device_removed' })
        .where(
          and(eq(sessions.deviceId, device.id), isNull(sessions.revokedAt)),
        )
        .returning({ id: sessions.id });
      await this.syncUserBiometricFlag(user.id, tx);
      await this.audit.log(
        {
          action: AuditAction.DEVICE_REMOVED,
          actorUserId: user.id,
          actorRole: user.role,
          resourceType: 'device',
          resourceId: device.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: { sessions_revoked: revoked.length },
        },
        tx,
      );
      return { ok: true, sessions_revoked: revoked.length };
    });
  }

  private async syncUserBiometricFlag(userId: string, tx: DbOrTx) {
    await tx
      .update(users)
      .set({
        biometricEnabled: sql`EXISTS (SELECT 1 FROM ${devices} WHERE ${devices.userId} = ${userId} AND ${devices.biometricEnabled} = true AND ${devices.revokedAt} IS NULL)`,
      })
      .where(eq(users.id, userId));
  }
}
