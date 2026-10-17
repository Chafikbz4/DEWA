import { lastValueFrom, of } from 'rxjs';
import { Paginated } from '../http/envelope';
import { metrics } from './metrics';
import { redact, redactObject } from './redact';
import { SecretFieldsInterceptor } from './secret-fields.interceptor';

describe('log redaction', () => {
  it('removes tokens, contacts and long numbers from messages', () => {
    const msg =
      'login +213661234567 / 0661 23 45 67 amel@example.dz Bearer abcdef123456789 eyJhbGciOi.eyJzdWIiOiIx.c2lnbmF0dXJl card 4111 1111 1111 1111 nin 123456789012345678 password=Secr3t! otp: 482913';
    const out = redact(msg);
    for (const leak of [
      '661234567',
      '0661 23 45 67',
      'amel@example.dz',
      'abcdef123456789',
      'eyJhbGciOi',
      '4111',
      '123456789012345678',
      'Secr3t!',
      '482913',
    ])
      expect(out).not.toContain(leak);
    expect(out).toContain('[email]');
    expect(out).toContain('[phone]');
  });

  it('keeps request ids and codes readable', () => {
    expect(
      redact(
        'GET /orders/3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b -> ORDER_NOT_FOUND [req 1a2b3c4d]',
      ),
    ).toBe(
      'GET /orders/3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b -> ORDER_NOT_FOUND [req 1a2b3c4d]',
    );
  });

  it('masks secret keys in objects', () => {
    expect(
      redactObject({
        user: 'u1',
        password: 'x',
        nested: { refresh_token: 't', note: 'call 0550 12 34 56' },
      }),
    ).toEqual({
      user: 'u1',
      password: '[redacted]',
      nested: { refresh_token: '[redacted]', note: 'call [phone]' },
    });
  });
});

describe('SecretFieldsInterceptor', () => {
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', route: { path: '/x' } }),
    }),
  } as never;
  const run = (body: unknown) =>
    lastValueFrom(
      new SecretFieldsInterceptor().intercept(ctx, { handle: () => of(body) }),
    );

  it('strips secrets at any depth, in snake_case and camelCase', async () => {
    const out = await run({
      id: 1,
      is_encrypted: true,
      password_hash: 'h',
      profile: { national_id_encrypted: 'x', first_name: 'A' },
      rows: [
        {
          passwordHash: 'h',
          mfaSecretEncrypted: 's',
          storageKey: 'k',
          pickupCodeHash: 'p',
          ok: 1,
        },
      ],
    });
    expect(out).toEqual({
      id: 1,
      is_encrypted: true,
      profile: { first_name: 'A' },
      rows: [{ ok: 1 }],
    });
  });

  it('keeps paginated responses paginated', async () => {
    const out = (await run(
      Paginated.of([{ id: 1, token_hash: 'x' }], 1, 1, 20).withMeta({
        unread_count: 2,
      }),
    )) as Paginated<unknown>;
    expect(out).toBeInstanceOf(Paginated);
    expect(out.items).toEqual([{ id: 1 }]);
    expect(out.extraMeta).toEqual({ unread_count: 2 });
  });
});

describe('metrics registry', () => {
  it('renders Prometheus text with counters and histograms', () => {
    metrics.observeHttp('GET', '/orders/:id', 200, 0.12);
    metrics.inc('dewa_test_events_total', 'test counter', { kind: 'a' });
    const text = metrics.render();
    expect(text).toContain(
      'http_requests_total{method="GET",route="/orders/:id",status="200"} 1',
    );
    expect(text).toContain(
      'http_request_duration_seconds_bucket{method="GET",route="/orders/:id",le="0.25"} 1',
    );
    expect(text).toContain('dewa_test_events_total{kind="a"} 1');
    expect(text).toContain('# TYPE process_resident_memory_bytes gauge');
  });
});
