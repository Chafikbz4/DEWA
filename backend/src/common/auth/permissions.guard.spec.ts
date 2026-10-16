import { Reflector } from '@nestjs/core';
import { PERMISSIONS, SUPER_ADMIN_ONLY } from './permissions';
import { PermissionsGuard, PermissionsService } from './permissions.guard';

const ctxFor = (user: unknown) =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as never;

describe('PermissionsGuard', () => {
  const reflector = new Reflector();
  const service = {
    permissionsOf: jest.fn(async (u: { role: string }) =>
      u.role === 'SUPER_ADMIN'
        ? new Set([...Object.values(PERMISSIONS), SUPER_ADMIN_ONLY])
        : new Set([PERMISSIONS.USERS_READ]),
    ),
  } as unknown as PermissionsService;
  const guard = new PermissionsGuard(reflector, service);
  const require = (perms: string[] | undefined) =>
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(perms);
  const admin = { id: 'a', role: 'ADMIN', mfaEnabled: true };

  it('ignores non-admin endpoints', async () => {
    require(undefined);
    await expect(guard.canActivate(ctxFor({ role: 'PATIENT' }))).resolves.toBe(
      true,
    );
  });

  it('requires an admin role and MFA', async () => {
    require([]);
    await expect(
      guard.canActivate(ctxFor({ role: 'PATIENT', mfaEnabled: true })),
    ).rejects.toMatchObject({ code: 'ROLE_FORBIDDEN' });
    await expect(
      guard.canActivate(ctxFor({ ...admin, mfaEnabled: false })),
    ).rejects.toMatchObject({ code: 'ADMIN_MFA_REQUIRED' });
    await expect(guard.canActivate(ctxFor(admin))).resolves.toBe(true);
  });

  it('checks every required permission', async () => {
    require([PERMISSIONS.USERS_READ]);
    await expect(guard.canActivate(ctxFor(admin))).resolves.toBe(true);
    require([PERMISSIONS.USERS_READ, PERMISSIONS.AUDIT_READ]);
    await expect(guard.canActivate(ctxFor(admin))).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
      details: { required: [PERMISSIONS.AUDIT_READ] },
    });
  });

  it('keeps SUPER_ADMIN-only actions away from sub-role admins', async () => {
    require([SUPER_ADMIN_ONLY]);
    await expect(guard.canActivate(ctxFor(admin))).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });
    await expect(
      guard.canActivate(
        ctxFor({ id: 's', role: 'SUPER_ADMIN', mfaEnabled: true }),
      ),
    ).resolves.toBe(true);
  });
});
