export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type ProviderName = 'MOCK' | 'EDAHABIA_SATIM';
export type ProviderPaymentStatus = 'PAID' | 'PENDING' | 'FAILED' | 'CANCELLED';

export interface InitiateInput {
  paymentId: string;
  orderReference: string;
  /** Always taken from the server-side order, never from the client. */
  amountCentimes: number;
  currency: 'DZD';
  returnUrl: string;
  failUrl: string;
  language: 'ar' | 'fr';
  /** MARKETPLACE (platform merchant) or PER_PHARMACY_MERCHANT (setting payment_collection_model). */
  collectionModel: string;
  pharmacyId: string;
}

export interface ProviderStatus {
  status: ProviderPaymentStatus;
  /** Amount the provider says was captured (centimes) – compared with our order. */
  amountCentimes: number | null;
  providerReference?: string | null;
  raw: unknown;
}

export interface WebhookCheck {
  signatureValid: boolean;
  eventId: string | null;
  eventType: string;
  providerOrderId: string | null;
  payload: unknown;
}

/**
 * Payment gateway abstraction. The platform never sees card data (PAN / PIN /
 * CVV): the patient is redirected to the provider's hosted page.
 * A result is only trusted after `getStatus` (server-to-server) confirms it.
 */
export interface IPaymentProvider {
  readonly name: ProviderName;
  initiate(
    input: InitiateInput,
  ): Promise<{ providerOrderId: string; redirectUrl: string; raw: unknown }>;
  getStatus(providerOrderId: string): Promise<ProviderStatus>;
  refund(input: {
    providerOrderId: string;
    amountCentimes: number;
    refundId: string;
  }): Promise<{
    status: 'COMPLETED' | 'PENDING' | 'FAILED';
    providerRefundReference: string | null;
    raw: unknown;
  }>;
  /** Verifies the webhook signature and extracts identifiers (no business processing). */
  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): WebhookCheck;
}
