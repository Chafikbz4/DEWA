import { Injectable } from '@nestjs/common';

export const CNAS_VERIFICATION_PROVIDER = Symbol('CNAS_VERIFICATION_PROVIDER');

export type CnasCheckStatus =
  'VERIFIED' | 'NOT_FOUND' | 'NOT_AVAILABLE' | 'ERROR';

export interface CnasCheckResult {
  status: CnasCheckStatus;
  /** e.g. "CNAS_API" – identifies the official source when VERIFIED. */
  source: string | null;
}

/**
 * Official CHIFA / CNAS coverage verification.
 * NO OFFICIAL INTEGRATION EXISTS. Implement only with an official CNAS API and
 * agreement. Until then the default provider always answers NOT_AVAILABLE and
 * chifa_submissions.verification_status stays NOT_VERIFIED (DB-enforced).
 */
export interface ICnasVerificationProvider {
  verify(input: {
    insuranceNumber: string;
    holderName: string;
  }): Promise<CnasCheckResult>;
}

@Injectable()
export class UnavailableCnasProvider implements ICnasVerificationProvider {
  async verify(): Promise<CnasCheckResult> {
    return { status: 'NOT_AVAILABLE', source: null };
  }
}
