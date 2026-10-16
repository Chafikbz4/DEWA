import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { AppException } from '../../../common/errors/app.exception';
import { createFakeDb, writes } from '../../../testing/fake-db';
import { TokenService } from './token.service';

const config = new ConfigService({
  ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  HASH_PEPPER: 'p'.repeat(48),
  JWT_ACCESS_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 30,
});
const jwt = new JwtService({ secret: 's'.repeat(48) });
const crypto = new CryptoService(config);

describe('TokenService', () => {
  it('issues an access JWT bound to a session and an opaque refresh token whose secret is stored hashed', async () => {
    const fake = createFakeDb();
    const service = new TokenService(
      fake.db,
      jwt,
      crypto,
      { emit: jest.fn() } as never,
      config,
    );
    const { tokens, sessionId } = await service.issue(
      { id: 'u1', role: 'PATIENT' },
      { ip: '1.2.3.4', userAgent: 'jest' },
    );

    const payload = jwt.decode(tokens.access_token);
    expect(payload).toMatchObject({
      sub: 'u1',
      sid: sessionId,
      role: 'PATIENT',
      typ: 'access',
    });
    expect(tokens.expires_in).toBe(900);

    const parsed = service.parseRefreshToken(tokens.refresh_token)!;
    expect(parsed.sessionId).toBe(sessionId);
    const row = writes(fake, 'values')[0];
    expect(row.refreshTokenHash).not.toContain(parsed.secret);
    expect(service.secretMatches(parsed.secret, row.refreshTokenHash)).toBe(
      true,
    );
    expect(row.familyId).toBeDefined();
  });

  it('keeps the family id on rotation', async () => {
    const fake = createFakeDb();
    const service = new TokenService(
      fake.db,
      jwt,
      crypto,
      { emit: jest.fn() } as never,
      config,
    );
    await service.issue(
      { id: 'u1', role: 'PATIENT' },
      { ip: null, userAgent: null },
      { familyId: 'fam-1', deviceId: 'dev-1' },
    );
    expect(writes(fake, 'values')[0]).toMatchObject({
      familyId: 'fam-1',
      deviceId: 'dev-1',
    });
  });

  it.each(['garbage', 'abc.def', `${'a'.repeat(36)}.short`])(
    'rejects malformed refresh token %p',
    (t) => {
      const service = new TokenService(
        createFakeDb().db,
        jwt,
        crypto,
        { emit: jest.fn() } as never,
        config,
      );
      expect(service.parseRefreshToken(t)).toBeNull();
    },
  );

  it('purpose tokens cannot be swapped (mfa vs reset)', async () => {
    const service = new TokenService(
      createFakeDb().db,
      jwt,
      crypto,
      { emit: jest.fn() } as never,
      config,
    );
    const mfa = await service.signMfaToken('u1', true);
    await expect(service.verifyMfaToken(mfa)).resolves.toEqual({
      userId: 'u1',
      setup: true,
    });
    await expect(service.verifyResetToken(mfa)).rejects.toBeInstanceOf(
      AppException,
    );

    const reset = await service.signResetToken(
      'u1',
      new Date(1_700_000_000_000),
    );
    await expect(service.verifyResetToken(reset)).resolves.toEqual({
      userId: 'u1',
      pwv: 1_700_000_000_000,
    });
    await expect(service.verifyMfaToken(reset)).rejects.toMatchObject({
      code: 'MFA_TOKEN_INVALID',
    });
  });
});
