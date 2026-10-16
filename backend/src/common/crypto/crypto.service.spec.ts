import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { CryptoService } from './crypto.service';
import { hashPassword, verifyPassword } from './password';

const config = new ConfigService({
  ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  HASH_PEPPER: 'p'.repeat(48),
});

describe('CryptoService', () => {
  const crypto = new CryptoService(config);

  it('encrypts and decrypts (AES-256-GCM) with a random IV', () => {
    const a = crypto.encrypt('1234 5678 9012');
    const b = crypto.encrypt('1234 5678 9012');
    expect(a).not.toEqual(b);
    expect(a.startsWith('v1:')).toBe(true);
    expect(crypto.decrypt(a)).toBe('1234 5678 9012');
  });

  it('rejects tampered ciphertext', () => {
    const parts = crypto.encrypt('secret').split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => crypto.decrypt(parts.join(':'))).toThrow();
  });

  it('hmacEquals verifies in constant time and depends on the pepper', () => {
    const h = crypto.hmac('123456');
    expect(crypto.hmacEquals('123456', h)).toBe(true);
    expect(crypto.hmacEquals('654321', h)).toBe(false);
    const other = new CryptoService(
      new ConfigService({
        ENCRYPTION_KEY: randomBytes(32).toString('base64'),
        HASH_PEPPER: 'x'.repeat(48),
      }),
    );
    expect(other.hmac('123456')).not.toEqual(h);
  });

  it('numericCode returns zero-padded 6 digits', () => {
    for (let i = 0; i < 50; i++)
      expect(crypto.numericCode()).toMatch(/^\d{6}$/);
  });
});

describe('password hashing (argon2id)', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('Str0ngPassw0rd');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(verifyPassword(hash, 'Str0ngPassw0rd')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong')).resolves.toBe(false);
  });

  it('returns false (not throw) for a malformed hash', async () => {
    await expect(verifyPassword('not-a-hash', 'x')).resolves.toBe(false);
  });
});
