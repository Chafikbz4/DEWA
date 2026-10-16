import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  IPaymentProvider,
  InitiateInput,
  ProviderPaymentStatus,
  ProviderStatus,
  WebhookCheck,
} from './payment-provider';

interface MockPayment {
  amountCentimes: number;
  status: ProviderPaymentStatus;
  /** Amount the "bank" actually captured (tests simulate mismatches). */
  capturedCentimes: number | null;
  refundedCentimes: number;
}

/**
 * Fully working in-memory gateway for development and tests.
 * Payments live in process memory (lost on restart) – never use in production.
 * Webhooks are signed with HMAC-SHA256(MOCK_PAYMENT_WEBHOOK_SECRET, raw body)
 * in the `x-mock-signature` header.
 */
@Injectable()
export class MockPaymentProvider implements IPaymentProvider {
  readonly name = 'MOCK' as const;
  private readonly store = new Map<string, MockPayment>();
  private readonly secret: string;
  private readonly baseUrl: string;
  /** Test switch: next initiate() call throws. */
  failNextInitiate = false;
  /** Test switch: next refund() call throws. */
  failNextRefund = false;

  constructor(config: ConfigService) {
    this.secret =
      config.get<string>('MOCK_PAYMENT_WEBHOOK_SECRET') ??
      randomBytes(32).toString('hex');
    this.baseUrl = (
      config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  async initiate(input: InitiateInput) {
    if (this.failNextInitiate) {
      this.failNextInitiate = false;
      throw new Error('Mock gateway unavailable');
    }
    const providerOrderId = `mock_${randomUUID()}`;
    this.store.set(providerOrderId, {
      amountCentimes: input.amountCentimes,
      status: 'PENDING',
      capturedCentimes: null,
      refundedCentimes: 0,
    });
    return {
      providerOrderId,
      redirectUrl: `${this.baseUrl}/payments/mock/checkout/${providerOrderId}`,
      raw: { mock: true, providerOrderId, amount: input.amountCentimes },
    };
  }

  async getStatus(providerOrderId: string): Promise<ProviderStatus> {
    const p = this.store.get(providerOrderId);
    if (!p)
      return {
        status: 'FAILED',
        amountCentimes: null,
        raw: { error: 'unknown order' },
      };
    return {
      status: p.status,
      amountCentimes: p.status === 'PAID' ? p.capturedCentimes : null,
      providerReference:
        p.status === 'PAID' ? `MOCKREF-${providerOrderId.slice(-8)}` : null,
      raw: { ...p },
    };
  }

  async refund(input: {
    providerOrderId: string;
    amountCentimes: number;
    refundId: string;
  }) {
    if (this.failNextRefund) {
      this.failNextRefund = false;
      throw new Error('Mock refund unavailable');
    }
    const p = this.store.get(input.providerOrderId);
    if (
      !p ||
      p.status !== 'PAID' ||
      p.refundedCentimes + input.amountCentimes > (p.capturedCentimes ?? 0)
    ) {
      return {
        status: 'FAILED' as const,
        providerRefundReference: null,
        raw: { error: 'refund not possible' },
      };
    }
    p.refundedCentimes += input.amountCentimes;
    return {
      status: 'COMPLETED' as const,
      providerRefundReference: `MOCKRFD-${input.refundId.slice(0, 8)}`,
      raw: { refunded: p.refundedCentimes },
    };
  }

  // ------------------------------------------------------------- webhooks

  sign(rawBody: Buffer | string) {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex');
  }

  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer,
  ): WebhookCheck {
    let payload: {
      event_id?: string;
      type?: string;
      provider_order_id?: string;
    } = {};
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      /* invalid JSON → invalid event */
    }
    const header = headers['x-mock-signature'];
    const given = Buffer.from(typeof header === 'string' ? header : '', 'hex');
    const expected = Buffer.from(this.sign(rawBody), 'hex');
    const signatureValid =
      given.length === expected.length && timingSafeEqual(given, expected);
    return {
      signatureValid,
      eventId: payload.event_id ?? null,
      eventType: payload.type ?? 'unknown',
      providerOrderId: payload.provider_order_id ?? null,
      payload,
    };
  }

  // ------------------------------------------------- simulation (dev/test)

  /** Simulates what the bank does on its hosted page. */
  simulate(
    providerOrderId: string,
    result: 'PAID' | 'FAILED' | 'CANCELLED',
    capturedCentimes?: number,
  ) {
    const p = this.store.get(providerOrderId);
    if (!p) return null;
    p.status = result;
    p.capturedCentimes =
      result === 'PAID' ? (capturedCentimes ?? p.amountCentimes) : null;
    return { ...p };
  }

  describe(providerOrderId: string) {
    const p = this.store.get(providerOrderId);
    return p
      ? {
          provider_order_id: providerOrderId,
          amount_centimes: p.amountCentimes,
          status: p.status,
        }
      : null;
  }
}
