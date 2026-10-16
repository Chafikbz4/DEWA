import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception';
import { createFakeDb } from '../../testing/fake-db';
import { ConsentsService } from './consents.service';

const config = new ConfigService({
  CONSENT_TERMS_VERSION: '2026-10',
  CONSENT_PRIVACY_VERSION: '2026-10',
});
const user = {
  id: 'u1',
  role: 'PATIENT',
  status: 'ACTIVE',
  sessionId: 's',
  preferredLanguage: 'fr',
  mfaEnabled: false,
} as const;
const meta = { ip: null, userAgent: null, deviceId: null };

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as AppException).code;
  }
  return 'NO_ERROR';
};

describe('ConsentsService', () => {
  const service = new ConsentsService(
    createFakeDb().db,
    { log: jest.fn() } as never,
    config,
  );

  it('requires TERMS and PRIVACY at the current version', () => {
    expect(
      codeOf(() =>
        service.assertRegistrationConsents([
          { type: 'TERMS', version: '2026-10' },
        ]),
      ),
    ).toBe('AUTH_CONSENT_REQUIRED');
    expect(
      codeOf(() =>
        service.assertRegistrationConsents([
          { type: 'TERMS', version: '2025-01' },
          { type: 'PRIVACY', version: '2026-10' },
        ]),
      ),
    ).toBe('AUTH_CONSENT_VERSION_OUTDATED');
    expect(
      codeOf(() =>
        service.assertRegistrationConsents([
          { type: 'TERMS', version: '2026-10' },
          { type: 'PRIVACY', version: '2026-10' },
          { type: 'HEALTH_DATA_PROCESSING', version: 'v1' },
        ]),
      ),
    ).toBe('NO_ERROR');
  });

  it('rejects duplicate consent types', () => {
    expect(
      codeOf(() =>
        service.assertRegistrationConsents([
          { type: 'TERMS', version: '2026-10' },
          { type: 'TERMS', version: '2026-10' },
        ]),
      ),
    ).toBe('VALIDATION_FAILED');
  });

  it('refuses to revoke TERMS / PRIVACY', async () => {
    await expect(service.revoke(user, 'TERMS', meta)).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED_NOT_REVOCABLE',
    });
    await expect(service.revoke(user, 'PRIVACY', meta)).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED_NOT_REVOCABLE',
    });
  });

  it('revokes optional consents and audits it', async () => {
    const fake = createFakeDb();
    const audit = { log: jest.fn() };
    const s = new ConsentsService(fake.db, audit as never, config);
    fake.queue([{ id: 'c1' }]);
    await expect(
      s.revoke(user, 'HEALTH_DATA_PROCESSING', meta),
    ).resolves.toEqual({ type: 'HEALTH_DATA_PROCESSING', revoked: 1 });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CONSENT_REVOKED' }),
    );
  });
});
