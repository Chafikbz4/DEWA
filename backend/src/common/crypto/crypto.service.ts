import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_VERSION = 'v1';

@Injectable()
export class CryptoService {
  private readonly key: Buffer;
  private readonly pepper: string;

  constructor(config: ConfigService) {
    this.key = Buffer.from(
      config.getOrThrow<string>('ENCRYPTION_KEY'),
      'base64',
    );
    this.pepper = config.getOrThrow<string>('HASH_PEPPER');
  }

  /** AES-256-GCM. Output: "v1:<iv>:<tag>:<ciphertext>" (base64 parts). */
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [KEY_VERSION, iv, tag, ct]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
      .join(':');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, ct] = payload.split(':');
    if (version !== KEY_VERSION || !iv || !tag || !ct) {
      throw new Error('Unsupported ciphertext format');
    }
    const decipher = createDecipheriv(
      ALGO,
      this.key,
      Buffer.from(iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ct, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Keyed hash for high-entropy secrets and short codes (OTP, tokens). */
  hmac(value: string): string {
    return createHmac('sha256', this.pepper).update(value).digest('hex');
  }

  hmacEquals(value: string, expectedHash: string): boolean {
    const a = Buffer.from(this.hmac(value), 'hex');
    const b = Buffer.from(expectedHash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  /** Cryptographically secure numeric code, zero-padded. */
  numericCode(digits = 6): string {
    return randomInt(0, 10 ** digits)
      .toString()
      .padStart(digits, '0');
  }
}
