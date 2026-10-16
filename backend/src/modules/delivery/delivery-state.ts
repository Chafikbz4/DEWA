import { deliveryStatusEnum } from '../../database/schema';

export type DeliveryStatus = (typeof deliveryStatusEnum.enumValues)[number];

/**
 * Delivery job lifecycle. Every edge that has an order counterpart is applied
 * together with the order state machine in the same transaction:
 *
 *   AVAILABLE → ASSIGNED          (driver accepts)      order READY_FOR_PICKUP → DELIVERY_ASSIGNED
 *   ASSIGNED  → AVAILABLE         (driver releases)     order DELIVERY_ASSIGNED → READY_FOR_PICKUP
 *   ASSIGNED  → PICKED_UP         (pickup code)         order → PICKED_UP
 *   PICKED_UP → OUT_FOR_DELIVERY  (driver starts)       order → OUT_FOR_DELIVERY
 *   OUT_FOR_DELIVERY → DELIVERED  (valid proof only)    order → DELIVERED
 *   PICKED_UP / OUT_FOR_DELIVERY → FAILED               order → FAILED
 *   FAILED    → RETURNED          (pharmacy confirms)   order FAILED → REFUND_PENDING
 *   AVAILABLE / ASSIGNED → CANCELLED (order cancelled / refunded before pickup)
 */
export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  AVAILABLE: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['AVAILABLE', 'PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['OUT_FOR_DELIVERY', 'FAILED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
  FAILED: ['RETURNED'],
  DELIVERED: [],
  RETURNED: [],
  CANCELLED: [],
};

/** Jobs a driver is currently responsible for. */
export const DRIVER_ACTIVE: DeliveryStatus[] = [
  'ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
];

export const canMove = (from: DeliveryStatus, to: DeliveryStatus) =>
  DELIVERY_TRANSITIONS[from].includes(to);
