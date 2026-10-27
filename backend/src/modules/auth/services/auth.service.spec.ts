import { ConfigService } from '@nestjs/config';
import { hashPassword } from '../../../common/crypto/password';
import { AppException } from '../../../common/errors/app.exception';
import { createFakeDb, writes } from '../../../testing/fake-db';
import { AuthService, UserRow } from './auth.service';

const config = new ConfigService({
  LOGIN_MAX_FAILED_ATTEMPTS: 5,
  LOGIN_LOCKOUT_MINUTES: 15,
});
const meta = { ip: '10.0.0.1', userAgent: 'jest', deviceId: null };

let passwordHash: string;
beforeAll(async () => {
  passwordHash = await hashPassword('Str0ngPassw0rd');
});

function user(over: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u1',
    role: 'PATIENT',
    email: 'amina@example.dz',
    phone: null,
    passwordHash,
    emailVerifiedAt: new Date(),
    phoneVerifiedAt: null,
    status: 'ACTIVE',
    preferredLanguage: 'fr',
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
    passwordChangedAt: null,
    mfaEnabled: false,
    mfaSecretEncrypted: null,
    biometricEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...over,
  };
}

function setup() {
  const fake = createFakeDb();
  const tokens = {
    issue: jest.fn().mockResolvedValue({
      sessionId: 's1',
      tokens: {
        access_token: 'a',
        refresh_token: 'r',
        token_type: 'Bearer',
        expires_in: 900,
      },
    }),
    signMfaToken: jest.fn().mockResolvedValue('mfa-token'),
    parseRefreshToken: jest.fn(),
    secretMatches: jest.fn(),
    revokeFamily: jest.fn().mockResolvedValue(3),
  };
  const audit = { log: jest.fn() };
  const service = new AuthService(
    fake.db,
    tokens as never,
    {} as never,
    {} as never,
    audit as never,
    config,
  );
  return { fake, tokens, audit, service };
}

const errorOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AppException;
  }
  throw new Error('expected an error');
};

describe('AuthService.login', () => {
  it('returns the same generic error for unknown users and audits it', async () => {
    const { fake, audit, service } = setup();
    fake.queue([]); // no user
    const err = await errorOf(
      service.login('ghost@example.dz', 'whatever', meta),
    );
    expect(err.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_LOGIN_FAILED' }),
    );
  });

  it('counts a bad password and locks at the threshold', async () => {
    const { fake, audit, service } = setup();
    fake.queue([user()], [{ failed: 5 }], []);
    const err = await errorOf(
      service.login('amina@example.dz', 'WrongPassw0rd', meta),
    );
    expect(err.code).toBe('AUTH_INVALID_CREDENTIALS');
    const lock = writes(fake, 'set').find((s) => s.lockedUntil);
    expect(lock?.lockedUntil.getTime()).toBeGreaterThan(
      Date.now() + 14 * 60_000,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_ACCOUNT_LOCKED' }),
    );
  });

  it('reveals the lock only when the password is correct', async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60_000);
    const a = setup();
    a.fake.queue([user({ lockedUntil })]);
    expect(
      (
        await errorOf(
          a.service.login('amina@example.dz', 'Str0ngPassw0rd', meta),
        )
      ).code,
    ).toBe('AUTH_ACCOUNT_LOCKED');
    const b = setup();
    b.fake.queue([user({ lockedUntil })]);
    expect(
      (await errorOf(b.service.login('amina@example.dz', 'nope', meta))).code,
    ).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('rejects suspended accounts with a specific code (after a correct password)', async () => {
    const { fake, service } = setup();
    fake.queue([user({ status: 'SUSPENDED' })]);
    expect(
      (await errorOf(service.login('amina@example.dz', 'Str0ngPassw0rd', meta)))
        .code,
    ).toBe('ACCOUNT_SUSPENDED');
  });

  it('issues tokens for a patient', async () => {
    const { fake, tokens, service } = setup();
    fake.queue([user()]);
    const res = await service.login('amina@example.dz', 'Str0ngPassw0rd', meta);
    expect(tokens.issue).toHaveBeenCalled();
    expect(res).toMatchObject({
      access_token: 'a',
      user: { id: 'u1', role: 'PATIENT' },
    });
  });

  it('issues tokens for an admin without MFA', async () => {
    const { fake, tokens, service } = setup();
    fake.queue([user({ role: 'ADMIN', mfaEnabled: false })]);
    const res = await service.login('amina@example.dz', 'Str0ngPassw0rd', meta);
    expect(res).toMatchObject({
      access_token: 'a',
      user: { id: 'u1', role: 'ADMIN' },
    });
    expect(tokens.issue).toHaveBeenCalled();
  });
});

describe('AuthService.refresh', () => {
  it('revokes the whole family when a rotated token is reused', async () => {
    const { fake, tokens, audit, service } = setup();
    tokens.parseRefreshToken.mockReturnValue({
      sessionId: 's-old',
      secret: 'x'.repeat(40),
    });
    tokens.secretMatches.mockReturnValue(true);
    fake.queue([
      {
        id: 's-old',
        userId: 'u1',
        familyId: 'fam',
        revokedAt: new Date(),
        replacedBySessionId: 's-new',
        expiresAt: new Date(Date.now() + 1e6),
      },
    ]);
    const err = await errorOf(service.refresh('token', undefined, meta));
    expect(err.code).toBe('AUTH_REFRESH_REUSED');
    expect(tokens.revokeFamily).toHaveBeenCalledWith(
      'fam',
      'refresh_reuse_detected',
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_REFRESH_REUSE_DETECTED' }),
    );
  });

  it('rejects a wrong secret without side effects', async () => {
    const { fake, tokens, service } = setup();
    tokens.parseRefreshToken.mockReturnValue({
      sessionId: 's1',
      secret: 'x'.repeat(40),
    });
    tokens.secretMatches.mockReturnValue(false);
    fake.queue([
      {
        id: 's1',
        revokedAt: new Date(),
        replacedBySessionId: 's2',
        familyId: 'fam',
      },
    ]);
    expect(
      (await errorOf(service.refresh('token', undefined, meta))).code,
    ).toBe('AUTH_REFRESH_INVALID');
    expect(tokens.revokeFamily).not.toHaveBeenCalled();
  });

  it('requires the bound device id for device-bound sessions', async () => {
    const { fake, tokens, service } = setup();
    tokens.parseRefreshToken.mockReturnValue({
      sessionId: 's1',
      secret: 'x'.repeat(40),
    });
    tokens.secretMatches.mockReturnValue(true);
    fake.queue(
      [
        {
          id: 's1',
          userId: 'u1',
          familyId: 'fam',
          revokedAt: null,
          replacedBySessionId: null,
          deviceId: 'd1',
          expiresAt: new Date(Date.now() + 1e6),
        },
      ],
      [{ identifier: 'phone-A', revokedAt: null }],
    );
    expect(
      (await errorOf(service.refresh('token', 'phone-B', meta))).code,
    ).toBe('AUTH_DEVICE_MISMATCH');
  });
});
