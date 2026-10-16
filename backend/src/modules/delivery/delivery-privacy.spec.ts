import { lastValueFrom, of } from 'rxjs';
import { Paginated } from '../../common/http/envelope';
import {
  canMove,
  DELIVERY_TRANSITIONS,
  DeliveryStatus,
} from './delivery-state';
import {
  DriverPrivacyInterceptor,
  findForbiddenKeys,
} from './delivery-privacy';

describe('driver privacy scan', () => {
  it('finds forbidden keys at any depth, case-insensitively', () => {
    expect(
      findForbiddenKeys({
        id: 1,
        dropoff: { first_name: 'Amel', National_ID: 'x' },
        jobs: [{ items: [] }, { ok: true, chifa: {} }],
      }),
    ).toEqual(['dropoff.National_ID', 'jobs[0].items', 'jobs[1].chifa']);
  });

  it('accepts the driver job shape', () => {
    expect(
      findForbiddenKeys({
        id: 'd',
        package_label: 'PKG-ABC234',
        pickup: { pharmacy_name: 'P', address: 'A', latitude: 1, longitude: 2 },
        dropoff: {
          first_name: 'Amel',
          phone: '+213',
          address: '5 Rue',
          notes: null,
        },
        assigned_at: new Date(),
      }),
    ).toEqual([]);
  });

  it('fails closed when a response would leak a forbidden field', async () => {
    const interceptor = new DriverPrivacyInterceptor();
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ route: { path: '/x' } }) }),
    } as never;
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx, { handle: () => of({ ok: 1 }) }),
      ),
    ).resolves.toEqual({ ok: 1 });
    const page = Paginated.of([{ id: 1 }], 1, 1, 20);
    await expect(
      lastValueFrom(interceptor.intercept(ctx, { handle: () => of(page) })),
    ).resolves.toBe(page);
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx, {
          handle: () => of(Paginated.of([{ chifa_number: '1' }], 1, 1, 20)),
        }),
      ),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    await expect(
      lastValueFrom(
        interceptor.intercept(ctx, {
          handle: () => of({ data: [{ medicine_name: 'X' }] }),
        }),
      ),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});

describe('delivery transitions', () => {
  const all = Object.keys(DELIVERY_TRANSITIONS) as DeliveryStatus[];
  const allowed = new Set([
    'AVAILABLE>ASSIGNED',
    'AVAILABLE>CANCELLED',
    'ASSIGNED>AVAILABLE',
    'ASSIGNED>PICKED_UP',
    'ASSIGNED>CANCELLED',
    'PICKED_UP>OUT_FOR_DELIVERY',
    'PICKED_UP>FAILED',
    'OUT_FOR_DELIVERY>DELIVERED',
    'OUT_FOR_DELIVERY>FAILED',
    'FAILED>RETURNED',
  ]);

  it.each(all.flatMap((from) => all.map((to) => [from, to] as const)))(
    '%s → %s',
    (from, to) => {
      expect(canMove(from, to)).toBe(allowed.has(`${from}>${to}`));
    },
  );

  it('only reaches DELIVERED from OUT_FOR_DELIVERY and never leaves terminal states', () => {
    expect(all.filter((s) => canMove(s, 'DELIVERED'))).toEqual([
      'OUT_FOR_DELIVERY',
    ]);
    for (const t of ['DELIVERED', 'RETURNED', 'CANCELLED'] as DeliveryStatus[])
      expect(DELIVERY_TRANSITIONS[t]).toEqual([]);
  });
});
