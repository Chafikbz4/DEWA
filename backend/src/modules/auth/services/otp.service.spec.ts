import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { CryptoService } from '../../../common/crypto/crypto.service';
import { AppException } from '../../../common/errors/app.exception';
import { createFakeDb, writes } from '../../../testing/fake-db';
import { OtpService } from './otp.service';

const config = new ConfigService({
  ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  HASH_PEPPER: 'p'.repeat(48),
  OTP_TTL_SECONDS: 300,
  OTP_MAX_ATTEMPTS: 5,
  OTP_RESEND_COOLDOWN_SECONDS: 60,
});
const crypto = new CryptoService(config);
const target = { type: 'PHONE' as const, value: '+213661234567' };

function setup() {
  const fake = createFakeDb();
  const sender = { send: jest.fn() };
  const service = new OtpService(fake.db, crypto, sender as never, config);
  return { fake, sender, service };
}

const errorCode = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as AppException).code;
  }
  return 'NO_ERROR';
};

describe('OtpService.issue', () => {
  it('stores only an HMAC of the code and sends the plain code', async () => {
    const { fake, sender, service } = setup();
    fake.queue([] /* no previous otp */, [] /* expire old */, [] /* insert */);
    await service.issue({
      target,
      purpose: 'REGISTER',
      userId: 'u1',
      lang: 'fr',
    });

    const inserted = writes(fake, 'values')[0];
    const sentBody = sender.send.mock.calls[0][4] as { code: string };
    expect(sentBody.code).toMatch(/^\d{6}$/);
    expect(inserted.codeHash).not.toContain(sentBody.code);
    expect(inserted.codeHash).toBe(
      crypto.hmac(`${target.value}|REGISTER|${sentBody.code}`),
    );
    expect(inserted.expiresAt.getTime() - Date.now()).toBeGreaterThan(290_000);
  });

  it('enforces the resend cooldown', async () => {
    const { fake, service } = setup();
    fake.queue([{ createdAt: new Date(Date.now() - 10_000) }]);
    expect(
      await errorCode(
        service.issue({
          target,
          purpose: 'REGISTER',
          userId: 'u1',
          lang: 'fr',
        }),
      ),
    ).toBe('OTP_RESEND_COOLDOWN');
  });

  it('stores a decoy but sends nothing when there is no user', async () => {
    const { fake, sender, service } = setup();
    fake.queue([], [], []);
    await service.issue({ target, purpose: 'LOGIN', userId: null, lang: 'fr' });
    expect(writes(fake, 'values')).toHaveLength(1);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('sends "account exists" instead of a code when asked', async () => {
    const { fake, sender, service } = setup();
    fake.queue([], [], []);
    await service.issue({
      target,
      purpose: 'REGISTER',
      userId: null,
      lang: 'ar',
      notifyAccountExists: true,
    });
    expect(sender.send).toHaveBeenCalledWith(
      'PHONE',
      target.value,
      'account_exists',
      'ar',
    );
  });
});

describe('OtpService.verify', () => {
  const otpRow = (code: string, over: Record<string, unknown> = {}) => ({
    id: 'otp1',
    userId: 'u1',
    attempts: 0,
    codeHash: crypto.hmac(`${target.value}|REGISTER|${code}`),
    ...over,
  });

  it('returns the user id and consumes the code', async () => {
    const { fake, service } = setup();
    fake.queue([otpRow('123456')], [{ id: 'otp1' }]);
    await expect(
      service.verify(target.value, 'REGISTER', '123456'),
    ).resolves.toBe('u1');
    expect(writes(fake, 'set')[0]).toHaveProperty('consumedAt');
  });

  it('counts a wrong code as an attempt', async () => {
    const { fake, service } = setup();
    fake.queue([otpRow('123456')], [{ attempts: 1 }]);
    expect(
      await errorCode(service.verify(target.value, 'REGISTER', '000000')),
    ).toBe('OTP_INVALID');
  });

  it('locks the code after the 5th wrong attempt', async () => {
    const { fake, service } = setup();
    fake.queue([otpRow('123456', { attempts: 4 })], [{ attempts: 5 }]);
    expect(
      await errorCode(service.verify(target.value, 'REGISTER', '000000')),
    ).toBe('OTP_TOO_MANY_ATTEMPTS');
    fake.queue([otpRow('123456', { attempts: 5 })]);
    expect(
      await errorCode(service.verify(target.value, 'REGISTER', '123456')),
    ).toBe('OTP_TOO_MANY_ATTEMPTS');
  });

  it('never accepts a decoy code (no user)', async () => {
    const { fake, service } = setup();
    fake.queue([otpRow('123456', { userId: null })], [{ id: 'otp1' }]);
    expect(
      await errorCode(service.verify(target.value, 'REGISTER', '123456')),
    ).toBe('OTP_INVALID');
  });

  it('rejects when no active code exists', async () => {
    const { fake, service } = setup();
    fake.queue([]);
    expect(
      await errorCode(service.verify(target.value, 'REGISTER', '123456')),
    ).toBe('OTP_INVALID');
  });
});
