/**
 * Order state machine – pure data + checks (no I/O). Documented in
 * docs/06-order-state-machine.md; executed by OrderStateMachineService.
 */
export const ORDER_STATUSES = [
  'AWAITING_PAYMENT',
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
  'PHARMACIST_VALIDATION_PENDING',
  'PREPARING',
  'READY_FOR_PICKUP',
  'DELIVERY_ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'REFUND_PENDING',
  'REFUNDED',
  'FAILED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type WorkflowVariant = 'VALIDATION_FIRST' | 'PAYMENT_FIRST';
export type ActorKind =
  'PATIENT' | 'PHARMACY' | 'PHARMACIST' | 'DRIVER' | 'ADMIN' | 'SYSTEM';

export interface Transition {
  from: OrderStatus;
  to: OrderStatus;
  /** Variants in which the edge exists. */
  variants: WorkflowVariant[];
  /** Who may trigger it. PHARMACIST = pharmacy staff with role OWNER or PHARMACIST. PHARMACY includes PHARMACIST. */
  actors: ActorKind[];
  /** A reason is mandatory (cancellations, refusals, failures). */
  reasonRequired?: boolean;
}

const BOTH: WorkflowVariant[] = ['VALIDATION_FIRST', 'PAYMENT_FIRST'];
const VF: WorkflowVariant[] = ['VALIDATION_FIRST'];
const PF: WorkflowVariant[] = ['PAYMENT_FIRST'];

export const TRANSITIONS: Transition[] = [
  // --- validation first ---
  {
    from: 'PHARMACIST_VALIDATION_PENDING',
    to: 'AWAITING_PAYMENT',
    variants: VF,
    actors: ['PHARMACIST'],
  },
  // --- payment (both variants) ---
  {
    from: 'AWAITING_PAYMENT',
    to: 'PAYMENT_PENDING',
    variants: BOTH,
    actors: ['SYSTEM'],
  },
  {
    from: 'PAYMENT_PENDING',
    to: 'AWAITING_PAYMENT',
    variants: BOTH,
    actors: ['SYSTEM'],
  },
  {
    from: 'PAYMENT_PENDING',
    to: 'PAYMENT_CONFIRMED',
    variants: BOTH,
    actors: ['SYSTEM'],
  },
  // --- payment first: validation after payment ---
  {
    from: 'PAYMENT_CONFIRMED',
    to: 'PHARMACIST_VALIDATION_PENDING',
    variants: PF,
    actors: ['SYSTEM'],
  },
  {
    from: 'PHARMACIST_VALIDATION_PENDING',
    to: 'PREPARING',
    variants: PF,
    actors: ['PHARMACIST'],
  },
  {
    from: 'PAYMENT_CONFIRMED',
    to: 'PREPARING',
    variants: VF,
    actors: ['PHARMACY'],
  },
  // --- fulfillment ---
  {
    from: 'PREPARING',
    to: 'READY_FOR_PICKUP',
    variants: BOTH,
    actors: ['PHARMACY'],
  },
  {
    from: 'READY_FOR_PICKUP',
    to: 'COMPLETED',
    variants: BOTH,
    actors: ['PHARMACY'],
  },
  {
    from: 'READY_FOR_PICKUP',
    to: 'DELIVERY_ASSIGNED',
    variants: BOTH,
    actors: ['DRIVER', 'SYSTEM'],
  },
  {
    from: 'DELIVERY_ASSIGNED',
    to: 'READY_FOR_PICKUP',
    variants: BOTH,
    actors: ['DRIVER', 'ADMIN', 'SYSTEM'],
    reasonRequired: true,
  },
  {
    from: 'DELIVERY_ASSIGNED',
    to: 'PICKED_UP',
    variants: BOTH,
    actors: ['DRIVER'],
  },
  {
    from: 'PICKED_UP',
    to: 'OUT_FOR_DELIVERY',
    variants: BOTH,
    actors: ['DRIVER'],
  },
  {
    from: 'OUT_FOR_DELIVERY',
    to: 'DELIVERED',
    variants: BOTH,
    actors: ['DRIVER'],
  },
  {
    from: 'PICKED_UP',
    to: 'FAILED',
    variants: BOTH,
    actors: ['DRIVER', 'ADMIN'],
    reasonRequired: true,
  },
  {
    from: 'OUT_FOR_DELIVERY',
    to: 'FAILED',
    variants: BOTH,
    actors: ['DRIVER', 'ADMIN'],
    reasonRequired: true,
  },
  {
    from: 'FAILED',
    to: 'REFUND_PENDING',
    variants: BOTH,
    actors: ['PHARMACY', 'ADMIN', 'SYSTEM'],
  },
  // --- cancellations before any capture ---
  {
    from: 'PHARMACIST_VALIDATION_PENDING',
    to: 'CANCELLED',
    variants: VF,
    actors: ['PATIENT', 'PHARMACIST', 'ADMIN', 'SYSTEM'],
    reasonRequired: true,
  },
  {
    from: 'AWAITING_PAYMENT',
    to: 'CANCELLED',
    variants: BOTH,
    actors: ['PATIENT', 'PHARMACY', 'ADMIN', 'SYSTEM'],
    reasonRequired: true,
  },
  {
    from: 'PAYMENT_PENDING',
    to: 'CANCELLED',
    variants: BOTH,
    actors: ['PATIENT', 'PHARMACY', 'ADMIN', 'SYSTEM'],
    reasonRequired: true,
  },
  // --- cancellations after capture → refund ---
  {
    from: 'PAYMENT_CONFIRMED',
    to: 'REFUND_PENDING',
    variants: BOTH,
    actors: ['PATIENT', 'PHARMACY', 'ADMIN', 'SYSTEM'],
    reasonRequired: true,
  },
  {
    from: 'PHARMACIST_VALIDATION_PENDING',
    to: 'REFUND_PENDING',
    variants: PF,
    actors: ['PATIENT', 'PHARMACIST', 'ADMIN', 'SYSTEM'],
    reasonRequired: true,
  },
  {
    from: 'PREPARING',
    to: 'REFUND_PENDING',
    variants: BOTH,
    actors: ['PHARMACY', 'ADMIN'],
    reasonRequired: true,
  },
  {
    from: 'READY_FOR_PICKUP',
    to: 'REFUND_PENDING',
    variants: BOTH,
    actors: ['PHARMACY', 'ADMIN'],
    reasonRequired: true,
  },
  {
    from: 'DELIVERY_ASSIGNED',
    to: 'REFUND_PENDING',
    variants: BOTH,
    actors: ['PHARMACY', 'ADMIN'],
    reasonRequired: true,
  },
  {
    from: 'REFUND_PENDING',
    to: 'REFUNDED',
    variants: BOTH,
    actors: ['SYSTEM', 'ADMIN'],
  },
];

export const TERMINAL: OrderStatus[] = [
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
];
/** Orders that no longer block re-ordering the same offer (also the DB partial unique index). */
export const INACTIVE: OrderStatus[] = ['CANCELLED', 'FAILED', 'REFUNDED'];

export const initialStatus = (variant: WorkflowVariant): OrderStatus =>
  variant === 'VALIDATION_FIRST'
    ? 'PHARMACIST_VALIDATION_PENDING'
    : 'AWAITING_PAYMENT';

export function findTransition(
  variant: WorkflowVariant,
  from: OrderStatus,
  to: OrderStatus,
): Transition | undefined {
  return TRANSITIONS.find(
    (t) => t.from === from && t.to === to && t.variants.includes(variant),
  );
}

/** PHARMACIST satisfies PHARMACY requirements (a pharmacist is pharmacy staff). */
export function actorAllowed(t: Transition, actor: ActorKind): boolean {
  if (t.actors.includes(actor)) return true;
  return actor === 'PHARMACIST' && t.actors.includes('PHARMACY');
}

export type TransitionCheck = 'OK' | 'INVALID_TRANSITION' | 'FORBIDDEN';

export function checkTransition(
  variant: WorkflowVariant,
  from: OrderStatus,
  to: OrderStatus,
  actor: ActorKind,
): TransitionCheck {
  const t = findTransition(variant, from, to);
  if (!t) return 'INVALID_TRANSITION';
  return actorAllowed(t, actor) ? 'OK' : 'FORBIDDEN';
}

/**
 * Where a cancel request lands, per status. `null` = not cancellable by anyone.
 * A patient asking to cancel in PREPARING / READY / DELIVERY_ASSIGNED needs
 * pharmacy or admin approval.
 */
export function cancelTarget(
  variant: WorkflowVariant,
  from: OrderStatus,
): OrderStatus | null {
  if (findTransition(variant, from, 'CANCELLED')) return 'CANCELLED';
  if (findTransition(variant, from, 'REFUND_PENDING') && from !== 'FAILED')
    return 'REFUND_PENDING';
  return null;
}
