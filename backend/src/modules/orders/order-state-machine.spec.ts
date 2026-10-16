import {
  ActorKind,
  cancelTarget,
  checkTransition,
  initialStatus,
  ORDER_STATUSES,
  OrderStatus,
  WorkflowVariant,
} from './order-state-machine';

/**
 * Independent expectation list (do not generate it from TRANSITIONS):
 * "<variants>|<from>|<to>|<actors>" with V = VALIDATION_FIRST, P = PAYMENT_FIRST.
 * PHARMACIST implicitly satisfies PHARMACY.
 */
const EXPECTED = [
  'V|PHARMACIST_VALIDATION_PENDING|AWAITING_PAYMENT|PHARMACIST',
  'VP|AWAITING_PAYMENT|PAYMENT_PENDING|SYSTEM',
  'VP|PAYMENT_PENDING|AWAITING_PAYMENT|SYSTEM',
  'VP|PAYMENT_PENDING|PAYMENT_CONFIRMED|SYSTEM',
  'P|PAYMENT_CONFIRMED|PHARMACIST_VALIDATION_PENDING|SYSTEM',
  'P|PHARMACIST_VALIDATION_PENDING|PREPARING|PHARMACIST',
  'V|PAYMENT_CONFIRMED|PREPARING|PHARMACY,PHARMACIST',
  'VP|PREPARING|READY_FOR_PICKUP|PHARMACY,PHARMACIST',
  'VP|READY_FOR_PICKUP|COMPLETED|PHARMACY,PHARMACIST',
  'VP|READY_FOR_PICKUP|DELIVERY_ASSIGNED|DRIVER,SYSTEM',
  'VP|DELIVERY_ASSIGNED|READY_FOR_PICKUP|DRIVER,ADMIN,SYSTEM',
  'VP|DELIVERY_ASSIGNED|PICKED_UP|DRIVER',
  'VP|PICKED_UP|OUT_FOR_DELIVERY|DRIVER',
  'VP|OUT_FOR_DELIVERY|DELIVERED|DRIVER',
  'VP|PICKED_UP|FAILED|DRIVER,ADMIN',
  'VP|OUT_FOR_DELIVERY|FAILED|DRIVER,ADMIN',
  'VP|FAILED|REFUND_PENDING|PHARMACY,PHARMACIST,ADMIN,SYSTEM',
  'V|PHARMACIST_VALIDATION_PENDING|CANCELLED|PATIENT,PHARMACIST,ADMIN,SYSTEM',
  'VP|AWAITING_PAYMENT|CANCELLED|PATIENT,PHARMACY,PHARMACIST,ADMIN,SYSTEM',
  'VP|PAYMENT_PENDING|CANCELLED|PATIENT,PHARMACY,PHARMACIST,ADMIN,SYSTEM',
  'VP|PAYMENT_CONFIRMED|REFUND_PENDING|PATIENT,PHARMACY,PHARMACIST,ADMIN,SYSTEM',
  'P|PHARMACIST_VALIDATION_PENDING|REFUND_PENDING|PATIENT,PHARMACIST,ADMIN,SYSTEM',
  'VP|PREPARING|REFUND_PENDING|PHARMACY,PHARMACIST,ADMIN',
  'VP|READY_FOR_PICKUP|REFUND_PENDING|PHARMACY,PHARMACIST,ADMIN',
  'VP|DELIVERY_ASSIGNED|REFUND_PENDING|PHARMACY,PHARMACIST,ADMIN',
  'VP|REFUND_PENDING|REFUNDED|SYSTEM,ADMIN',
];

const ACTORS: ActorKind[] = [
  'PATIENT',
  'PHARMACY',
  'PHARMACIST',
  'DRIVER',
  'ADMIN',
  'SYSTEM',
];
const VARIANTS: WorkflowVariant[] = ['VALIDATION_FIRST', 'PAYMENT_FIRST'];

const expected = new Map<string, Set<ActorKind>>();
for (const line of EXPECTED) {
  const [v, from, to, actors] = line.split('|');
  for (const variant of VARIANTS) {
    if (!v.includes(variant[0])) continue;
    expected.set(
      `${variant}|${from}|${to}`,
      new Set(actors.split(',') as ActorKind[]),
    );
  }
}

describe('order state machine – exhaustive transition matrix', () => {
  const cases: [
    WorkflowVariant,
    OrderStatus,
    OrderStatus,
    ActorKind,
    string,
  ][] = [];
  for (const variant of VARIANTS)
    for (const from of ORDER_STATUSES)
      for (const to of ORDER_STATUSES)
        for (const actor of ACTORS) {
          const allowed = expected.get(`${variant}|${from}|${to}`);
          cases.push([
            variant,
            from,
            to,
            actor,
            !allowed
              ? 'INVALID_TRANSITION'
              : allowed.has(actor)
                ? 'OK'
                : 'FORBIDDEN',
          ]);
        }

  it(`covers all ${cases.length} (variant, from, to, actor) combinations`, () => {
    expect(cases).toHaveLength(
      2 * ORDER_STATUSES.length * ORDER_STATUSES.length * ACTORS.length,
    );
    const mismatches = cases
      .map(([variant, from, to, actor, want]) => ({
        variant,
        from,
        to,
        actor,
        want,
        got: checkTransition(variant, from, to, actor),
      }))
      .filter((c) => c.got !== c.want);
    expect(mismatches).toEqual([]);
  });

  it('has the documented number of valid edges per variant', () => {
    const count = (variant: WorkflowVariant) =>
      [...expected.keys()].filter((k) => k.startsWith(variant)).length;
    expect(count('VALIDATION_FIRST')).toBe(23);
    expect(count('PAYMENT_FIRST')).toBe(23);
  });

  it('starts each variant in the right status', () => {
    expect(initialStatus('VALIDATION_FIRST')).toBe(
      'PHARMACIST_VALIDATION_PENDING',
    );
    expect(initialStatus('PAYMENT_FIRST')).toBe('AWAITING_PAYMENT');
  });

  it.each(['DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'] as OrderStatus[])(
    '%s is terminal (no outgoing edge)',
    (from) => {
      for (const variant of VARIANTS)
        for (const to of ORDER_STATUSES)
          for (const actor of ACTORS)
            expect(checkTransition(variant, from, to, actor)).toBe(
              'INVALID_TRANSITION',
            );
    },
  );

  it('never allows cancelling after the goods left the pharmacy', () => {
    for (const variant of VARIANTS)
      for (const from of [
        'PICKED_UP',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'COMPLETED',
      ] as OrderStatus[]) {
        expect(cancelTarget(variant, from)).toBeNull();
      }
  });

  it('maps cancellations to CANCELLED before capture and REFUND_PENDING after', () => {
    expect(
      cancelTarget('VALIDATION_FIRST', 'PHARMACIST_VALIDATION_PENDING'),
    ).toBe('CANCELLED');
    expect(cancelTarget('PAYMENT_FIRST', 'PHARMACIST_VALIDATION_PENDING')).toBe(
      'REFUND_PENDING',
    );
    expect(cancelTarget('VALIDATION_FIRST', 'AWAITING_PAYMENT')).toBe(
      'CANCELLED',
    );
    expect(cancelTarget('PAYMENT_FIRST', 'PAYMENT_PENDING')).toBe('CANCELLED');
    expect(cancelTarget('VALIDATION_FIRST', 'PAYMENT_CONFIRMED')).toBe(
      'REFUND_PENDING',
    );
    expect(cancelTarget('PAYMENT_FIRST', 'PREPARING')).toBe('REFUND_PENDING');
    expect(cancelTarget('VALIDATION_FIRST', 'DELIVERY_ASSIGNED')).toBe(
      'REFUND_PENDING',
    );
    expect(cancelTarget('VALIDATION_FIRST', 'FAILED')).toBeNull();
  });

  it('patients can never move fulfillment forward', () => {
    for (const variant of VARIANTS)
      for (const [from, to] of [
        ['PREPARING', 'READY_FOR_PICKUP'],
        ['READY_FOR_PICKUP', 'COMPLETED'],
        ['OUT_FOR_DELIVERY', 'DELIVERED'],
        ['PAYMENT_PENDING', 'PAYMENT_CONFIRMED'],
      ] as [OrderStatus, OrderStatus][]) {
        expect(checkTransition(variant, from, to, 'PATIENT')).not.toBe('OK');
      }
  });
});
