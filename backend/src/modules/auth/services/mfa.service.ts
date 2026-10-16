import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import { CryptoService } from '../../../common/crypto/crypto.service';

authenticator.options = { window: 1, step: 30, digits: 6 };

/** RFC 6238 TOTP. Secrets are stored AES-256-GCM encrypted. */
@Injectable()
export class MfaService {
  constructor(private readonly crypto: CryptoService) {}

  createSecret(accountLabel: string) {
    const secret = authenticator.generateSecret(20);
    return {
      secret,
      encrypted: this.crypto.encrypt(secret),
      otpauthUrl: authenticator.keyuri(accountLabel, 'DEWA', secret),
    };
  }

  verify(encryptedSecret: string | null, code: string): boolean {
    if (!encryptedSecret) return false;
    try {
      return authenticator.check(code, this.crypto.decrypt(encryptedSecret));
    } catch {
      return false;
    }
  }
}
