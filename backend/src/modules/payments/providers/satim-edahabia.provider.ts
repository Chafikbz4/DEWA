import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  IPaymentProvider,
  InitiateInput,
  ProviderStatus,
  WebhookCheck,
} from './payment-provider';

/**
 * SKELETON – NOT IMPLEMENTED. Requires the official SATIM / Edahabia (CIB)
 * merchant integration kit and a signed merchant agreement. No API details are
 * assumed here; fill each TODO from the official documentation only.
 *
 * Required before implementation:
 *  - Merchant account(s): one platform merchant (MARKETPLACE model) or one per
 *    pharmacy (PER_PHARMACY_MERCHANT) – legal decision pending, see
 *    docs/api/07-payments.md §8.
 *  - Credentials issued by the acquirer (merchant identifiers, API user,
 *    password / keys, terminal ids) → environment variables, never in code.
 *  - Test (sandbox) and production endpoint URLs.
 *  - The exact request/response formats for: order registration (amount in the
 *    smallest unit, currency code for DZD, return/fail URLs, language),
 *    order status inquiry, refund / reversal, and any notification/callback.
 *  - Signature / authentication scheme for callbacks (if callbacks exist), or
 *    confirmation that status inquiry is the only trusted source.
 *  - Certification test cases required by the acquirer.
 *
 * Security rules that apply regardless: no card data ever touches our servers
 * (hosted payment page), amounts come from the server-side order, status is
 * confirmed server-to-server before an order is marked paid.
 */
@Injectable()
export class SatimEdahabiaProvider implements IPaymentProvider {
  readonly name = 'EDAHABIA_SATIM' as const;

  // TODO(official-doc): register the order with the gateway and return its order id + hosted page URL.
  async initiate(
    _input: InitiateInput,
  ): Promise<{ providerOrderId: string; redirectUrl: string; raw: unknown }> {
    throw new NotImplementedException(
      'SATIM/Edahabia provider requires the official merchant integration kit',
    );
  }

  // TODO(official-doc): server-to-server status inquiry; map the gateway result to PAID / PENDING / FAILED / CANCELLED and the captured amount.
  async getStatus(_providerOrderId: string): Promise<ProviderStatus> {
    throw new NotImplementedException(
      'SATIM/Edahabia provider requires the official merchant integration kit',
    );
  }

  // TODO(official-doc): refund / reversal call (full and partial, if supported by the acquirer).
  async refund(_input: {
    providerOrderId: string;
    amountCentimes: number;
    refundId: string;
  }): Promise<{
    status: 'COMPLETED' | 'PENDING' | 'FAILED';
    providerRefundReference: string | null;
    raw: unknown;
  }> {
    throw new NotImplementedException(
      'SATIM/Edahabia provider requires the official merchant integration kit',
    );
  }

  // TODO(official-doc): callback authentication. Until defined, callbacks are rejected and status inquiry is the only source of truth.
  verifyWebhook(): WebhookCheck {
    return {
      signatureValid: false,
      eventId: null,
      eventType: 'unsupported',
      providerOrderId: null,
      payload: null,
    };
  }
}
