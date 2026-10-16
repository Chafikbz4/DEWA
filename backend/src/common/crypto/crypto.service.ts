import { Inject, Injectable, Optional } from '@nestjs/common';
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
const IV_LEN = 12;
const TAG_LEN = 16;

export const KEY_PROVIDER = Symbol('KEY_PROVIDER');

/**
 * Source of data-encryption keys. The env implementation reads keys from
 * configuration; a KMS implementation (AWS KMS, Vault…) can replace it.
 */
export interface IKeyProvider {
  /** Key used for new encryptions. */
  current(): { id: string; key: Buffer };
  /** Any key (current or retired) by id, for decryption. */
  get(id: string): Buffer | undefined;
}

/**
 * ENCRYPTION_KEY (+ ENCRYPTION_KEY_ID, default "v1") is the current key.
 * ENCRYPTION_KEYS_PREVIOUS="v0:<base64>,..." keeps retired keys readable
 * during rotation (see `npm run crypto:rotate`).
 */
export class EnvKeyProvider implements IKeyProvider {
  private readonly keys = new Map<string, Buffer>();
  private readonly currentId: string;

  constructor(config: ConfigService) {
    this.currentId = config.get<string>('ENCRYPTION_KEY_ID') || 'v1';
    this.keys.set(
      this.currentId,
      Buffer.from(config.getOrThrow<string>('ENCRYPTION_KEY'), 'base64'),
    );
    const previous = config.get<string>('ENCRYPTION_KEYS_PREVIOUS') ?? '';
    for (const entry of previous
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)) {
      const [id, b64] = entry.split(':');
      if (id && b64 && !this.keys.has(id))
        this.keys.set(id, Buffer.from(b64, 'base64'));
    }
    for (const [id, key] of this.keys) {
      if (key.length !== 32)
        throw new Error(`Encryption key ${id} must be 32 bytes`);
      if (id.includes(':'))
        throw new Error('Encryption key ids cannot contain ":"');
    }
  }

  current() {
    return { id: this.currentId, key: this.keys.get(this.currentId)! };
  }

  get(id: string) {
    return this.keys.get(id);
  }
}

@Injectable()
export class CryptoService {
  private readonly pepper: string;
  private readonly keys: IKeyProvider;

  constructor(
    config: ConfigService,
    @Optional() @Inject(KEY_PROVIDER) keys?: IKeyProvider,
  ) {
    this.pepper = config.getOrThrow<string>('HASH_PEPPER');
    this.keys = keys ?? new EnvKeyProvider(config);
  }

  get currentKeyId() {
    return this.keys.current().id;
  }

  /** AES-256-GCM. Output: "<keyId>:<iv>:<tag>:<ciphertext>" (base64 parts). */
  encrypt(plain: string): string {
    const { id, key } = this.keys.current();
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [
      id,
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ct.toString('base64'),
    ].join(':');
  }

  decrypt(payload: string): string {
    const [id, iv, tag, ct] = payload.split(':');
    const key = id ? this.keys.get(id) : undefined;
    if (!key || !iv || !tag || !ct)
      throw new Error('Unsupported ciphertext format or unknown key');
    const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ct, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Key id a ciphertext was produced with (for rotation jobs). */
  keyIdOf(payload: string): string {
    return payload.split(':')[0];
  }

  /** Re-encrypts with the current key if needed. */
  rotate(payload: string): string {
    return this.keyIdOf(payload) === this.currentKeyId
      ? payload
      : this.encrypt(this.decrypt(payload));
  }

  /** Binary AES-256-GCM: [iv(12)][tag(16)][ciphertext]. Key id returned separately. */
  encryptBuffer(data: Buffer): { data: Buffer; keyId: string } {
    const { id, key } = this.keys.current();
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv);
    const ct = Buffer.concat([cipher.update(data), cipher.final()]);
    return { data: Buffer.concat([iv, cipher.getAuthTag(), ct]), keyId: id };
  }

  decryptBuffer(data: Buffer, keyId: string): Buffer {
    const key = this.keys.get(keyId);
    if (!key || data.length < IV_LEN + TAG_LEN)
      throw new Error('Unknown key or corrupted data');
    const decipher = createDecipheriv(ALGO, key, data.subarray(0, IV_LEN));
    decipher.setAuthTag(data.subarray(IV_LEN, IV_LEN + TAG_LEN));
    return Buffer.concat([
      decipher.update(data.subarray(IV_LEN + TAG_LEN)),
      decipher.final(),
    ]);
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

  /** "1234567890" → "******7890" */
  static mask(value: string | null | undefined, visible = 4): string | null {
    if (!value) return null;
    return (
      '*'.repeat(Math.max(0, value.length - visible)) + value.slice(-visible)
    );
  }
}
