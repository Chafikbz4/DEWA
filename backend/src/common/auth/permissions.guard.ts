import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { Request } from 'express';
import { Database, DRIZZLE } from '../../database/database.module';
import { adminRolePermissions, adminUserRoles } from '../../database/schema';
import { AppException } from '../errors/app.exception';
import { Roles } from './decorators';
import { ALL_PERMISSIONS, Permission, SUPER_ADMIN_ONLY } from './permissions';

export const PERMISSIONS_KEY = 'auth:permissions';

/**
 * Admin endpoint guarded by permissions (ALL listed are required). Implies
 * role ADMIN or SUPER_ADMIN and an MFA-enabled account; with no argument any
 * such admin may call it.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, permissions),
    Roles('ADMIN', 'SUPER_ADMIN'),
  );

/** SUPER_ADMIN only (role changes, admin accounts, permission matrix). */
export const RequireSuperAdmin = () =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, [SUPER_ADMIN_ONLY]),
    Roles('SUPER_ADMIN'),
  );

/** Resolves an admin's effective permissions (no cache: revocations apply at once). */
@Injectable()
export class PermissionsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async permissionsOf(user: {
    id: string;
    role: string;
  }): Promise<Set<Permission>> {
    if (user.role === 'SUPER_ADMIN')
      return new Set<Permission>([...ALL_PERMISSIONS, SUPER_ADMIN_ONLY]);
    if (user.role !== 'ADMIN') return new Set();
    const rows = await this.db
      .select({ permission: adminRolePermissions.permission })
      .from(adminUserRoles)
      .innerJoin(
        adminRolePermissions,
        eq(adminRolePermissions.adminRole, adminUserRoles.adminRole),
      )
      .where(eq(adminUserRoles.userId, user.id));
    return new Set(rows.map((r) => r.permission as Permission));
  }
}

/** Runs after RolesGuard. Admin endpoints also require MFA. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    // No metadata: not an admin endpoint. Empty list: any MFA-enabled admin.
    if (!required) return true;
    const req = context
      .switchToHttp()
      .getRequest<Request & { permissions?: Set<Permission> }>();
    const user = req.user;
    if (!user) throw new AppException('UNAUTHORIZED');
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')
      throw new AppException('ROLE_FORBIDDEN');
    if (!user.mfaEnabled) throw new AppException('ADMIN_MFA_REQUIRED');
    const granted = await this.permissions.permissionsOf(user);
    req.permissions = granted;
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length)
      throw new AppException('PERMISSION_DENIED', { required: missing });
    return true;
  }
}
