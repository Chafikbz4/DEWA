import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../errors/app.exception';
import { AccountStatusGuard } from './account-status.guard';
import type { AuthUser } from './auth-user';
import { ALLOWED_STATUSES_KEY, ROLES_KEY } from './decorators';
import { RolesGuard } from './roles.guard';

function ctx(user?: Partial<AuthUser>): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function reflectorWith(meta: Record<string, unknown>) {
  const r = new Reflector();
  jest
    .spyOn(r, 'getAllAndOverride')
    .mockImplementation((key: unknown) => meta[key as string] as never);
  return r;
}

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as AppException).code;
  }
  return 'NO_ERROR';
};

describe('RolesGuard', () => {
  it('passes when no roles are required', () => {
    expect(
      new RolesGuard(reflectorWith({})).canActivate(ctx({ role: 'PATIENT' })),
    ).toBe(true);
  });

  it('allows listed roles and rejects others with ROLE_FORBIDDEN', () => {
    const guard = new RolesGuard(
      reflectorWith({ [ROLES_KEY]: ['ADMIN', 'SUPER_ADMIN'] }),
    );
    expect(guard.canActivate(ctx({ role: 'ADMIN' }))).toBe(true);
    expect(codeOf(() => guard.canActivate(ctx({ role: 'PATIENT' })))).toBe(
      'ROLE_FORBIDDEN',
    );
    expect(codeOf(() => guard.canActivate(ctx(undefined)))).toBe(
      'UNAUTHORIZED',
    );
  });
});

describe('AccountStatusGuard', () => {
  it('lets public (no user) requests through', () => {
    expect(
      new AccountStatusGuard(reflectorWith({})).canActivate(ctx(undefined)),
    ).toBe(true);
  });

  it.each([
    ['PENDING_VERIFICATION', 'ACCOUNT_PENDING_VERIFICATION'],
    ['SUSPENDED', 'ACCOUNT_SUSPENDED'],
    ['DELETED', 'ACCOUNT_DELETED'],
  ])('blocks %s with %s by default', (status, code) => {
    const guard = new AccountStatusGuard(reflectorWith({}));
    expect(
      codeOf(() =>
        guard.canActivate(ctx({ status: status as AuthUser['status'] })),
      ),
    ).toBe(code);
  });

  it('allows PENDING_VERIFICATION only when the route opts in', () => {
    const guard = new AccountStatusGuard(
      reflectorWith({ [ALLOWED_STATUSES_KEY]: ['PENDING_VERIFICATION'] }),
    );
    expect(guard.canActivate(ctx({ status: 'PENDING_VERIFICATION' }))).toBe(
      true,
    );
  });

  it('never lets SUSPENDED through, even if a route tries to opt in', () => {
    const guard = new AccountStatusGuard(
      reflectorWith({ [ALLOWED_STATUSES_KEY]: ['SUSPENDED'] }),
    );
    expect(codeOf(() => guard.canActivate(ctx({ status: 'SUSPENDED' })))).toBe(
      'ACCOUNT_SUSPENDED',
    );
  });
});
