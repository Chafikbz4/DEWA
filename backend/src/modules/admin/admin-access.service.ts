import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import {
  ADMIN_SUB_ROLES,
  AdminSubRole,
  ALL_PERMISSIONS,
  Permission,
} from '../../common/auth/permissions';
import { PermissionsService } from '../../common/auth/permissions.guard';
import { AppException } from '../../common/errors/app.exception';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  adminRolePermissions,
  adminUserRoles,
  users,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/services/token.service';

/** SUPER_ADMIN tooling: admin sub-role assignment and the permission matrix. */
@Injectable()
export class AdminAccessService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
  ) {}

  async matrix() {
    const rows = await this.db.select().from(adminRolePermissions);
    return {
      permissions: ALL_PERMISSIONS,
      roles: Object.fromEntries(
        ADMIN_SUB_ROLES.map((r) => [
          r,
          rows
            .filter((x) => x.adminRole === r)
            .map((x) => x.permission)
            .sort(),
        ]),
      ),
      super_admin: 'all permissions',
    };
  }

  async setRolePermissions(
    actor: AuthUser,
    role: AdminSubRole,
    perms: Permission[],
    reason: string,
    meta: RequestMeta,
  ) {
    const before = (await this.matrix()).roles[role];
    const next = [...new Set(perms)];
    await this.db.transaction(async (tx) => {
      await tx
        .delete(adminRolePermissions)
        .where(eq(adminRolePermissions.adminRole, role));
      if (next.length)
        await tx
          .insert(adminRolePermissions)
          .values(next.map((permission) => ({ adminRole: role, permission })));
      await this.audit.log(
        {
          action: 'ADMIN_ROLE_PERMISSIONS_CHANGED',
          actorUserId: actor.id,
          actorRole: actor.role,
          resourceType: 'admin_role',
          resourceId: role,
          ip: meta.ip,
          userAgent: meta.userAgent,
          reason,
          metadata: { before, after: next.sort() },
        },
        tx,
      );
    });
    return (await this.matrix()).roles[role];
  }

  async rolesOf(userId: string) {
    const rows = await this.db
      .select({ role: adminUserRoles.adminRole })
      .from(adminUserRoles)
      .where(eq(adminUserRoles.userId, userId));
    return rows.map((r) => r.role as AdminSubRole).sort();
  }

  async me(user: AuthUser) {
    return {
      role: user.role,
      admin_roles:
        user.role === 'SUPER_ADMIN' ? [] : await this.rolesOf(user.id),
      permissions: [...(await this.permissions.permissionsOf(user))].sort(),
      mfa_enabled: user.mfaEnabled,
    };
  }

  /** Replaces the sub-roles of an ADMIN account; its sessions are revoked so the change applies everywhere. */
  async setUserRoles(
    actor: AuthUser,
    userId: string,
    roles: AdminSubRole[],
    reason: string,
    meta: RequestMeta,
  ) {
    if (actor.id === userId) throw new AppException('CANNOT_MODIFY_SELF');
    const [target] = await this.db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!target) throw new AppException('USER_NOT_FOUND');
    if (target.role !== 'ADMIN')
      throw new AppException('ADMIN_ROLE_TARGET_INVALID');
    const before = await this.rolesOf(userId);
    const next = [...new Set(roles)].sort();
    await this.db.transaction(async (tx) => {
      const removed = before.filter((r) => !next.includes(r));
      if (removed.length)
        await tx
          .delete(adminUserRoles)
          .where(
            and(
              eq(adminUserRoles.userId, userId),
              inArray(adminUserRoles.adminRole, removed),
            ),
          );
      const added = next.filter((r) => !before.includes(r));
      if (added.length)
        await tx.insert(adminUserRoles).values(
          added.map((adminRole) => ({
            userId,
            adminRole,
            grantedBy: actor.id,
          })),
        );
      if (removed.length)
        await this.tokens.revokeAllForUser(
          userId,
          'admin_roles_changed',
          {},
          tx,
        );
      await this.audit.log(
        {
          action: 'ADMIN_SUB_ROLES_CHANGED',
          actorUserId: actor.id,
          actorRole: actor.role,
          resourceType: 'user',
          resourceId: userId,
          ip: meta.ip,
          userAgent: meta.userAgent,
          reason,
          metadata: { before, after: next },
        },
        tx,
      );
    });
    return { user_id: userId, admin_roles: next };
  }
}
