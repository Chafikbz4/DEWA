import { sql } from 'drizzle-orm';
import {
  char,
  check,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, money, pk, tstz, updatedAt } from './_columns';
import { fulfillmentTypeEnum, orderStatusEnum, roleEnum } from './enums';
import { users } from './identity';
import { offerItems, offers } from './offers';
import { pharmacies } from './pharmacy';
import { requests } from './requests';

export const orderReferenceSeq = pgSequence('order_reference_seq', {
  startWith: 1,
  increment: 1,
});

/** Statuses after which an offer may be ordered again. */
export const INACTIVE_ORDER_STATUSES = [
  'CANCELLED',
  'FAILED',
  'REFUNDED',
] as const;

export const orders = pgTable(
  'orders',
  {
    id: pk(),
    reference: varchar('reference', { length: 32 }).notNull(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'restrict' }),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'restrict' }),
    patientUserId: uuid('patient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'restrict' }),
    status: orderStatusEnum('status').notNull().default('AWAITING_PAYMENT'),
    /** Optimistic lock – increment on every status change. */
    version: integer('version').notNull().default(1),
    fulfillmentType: fulfillmentTypeEnum('fulfillment_type').notNull(),
    deliveryAddressSnapshot: jsonb('delivery_address_snapshot'),
    itemsSubtotalCentimes: money('items_subtotal_centimes').notNull(),
    deliveryFeeCentimes: money('delivery_fee_centimes').notNull().default(0),
    serviceFeeCentimes: money('service_fee_centimes').notNull().default(0),
    totalCentimes: money('total_centimes').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('DZD'),
    pharmacistValidatedBy: uuid('pharmacist_validated_by').references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    pharmacistValidatedAt: tstz('pharmacist_validated_at'),
    validationNote: text('validation_note'),
    paymentDeadlineAt: tstz('payment_deadline_at'),
    cancelReason: text('cancel_reason'),
    cancelledByUserId: uuid('cancelled_by_user_id').references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    cancelledAt: tstz('cancelled_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('orders_reference_uq').on(t.reference),
    /** Never two active orders for the same offer. */
    uniqueIndex('orders_offer_active_uq')
      .on(t.offerId)
      .where(sql`${t.status} NOT IN ('CANCELLED', 'FAILED', 'REFUNDED')`),
    check(
      'orders_money_chk',
      sql`${t.itemsSubtotalCentimes} >= 0 AND ${t.deliveryFeeCentimes} >= 0 AND ${t.serviceFeeCentimes} >= 0 AND ${t.totalCentimes} >= 0`,
    ),
    check(
      'orders_total_chk',
      sql`${t.totalCentimes} = ${t.itemsSubtotalCentimes} + ${t.deliveryFeeCentimes} + ${t.serviceFeeCentimes}`,
    ),
    check('orders_currency_chk', sql`${t.currency} = 'DZD'`),
    check('orders_version_chk', sql`${t.version} >= 1`),
    index('orders_patient_created_idx').on(t.patientUserId, t.createdAt),
    index('orders_pharmacy_status_created_idx').on(
      t.pharmacyId,
      t.status,
      t.createdAt,
    ),
    index('orders_status_created_idx').on(t.status, t.createdAt),
    index('orders_request_idx').on(t.requestId),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: pk(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    offerItemId: uuid('offer_item_id').references(() => offerItems.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 255 }).notNull(),
    quantity: integer('quantity').notNull(),
    unitPriceCentimes: money('unit_price_centimes').notNull(),
    lineTotalCentimes: money('line_total_centimes').notNull(),
  },
  (t) => [
    check('order_items_qty_chk', sql`${t.quantity} > 0`),
    check(
      'order_items_money_chk',
      sql`${t.unitPriceCentimes} >= 0 AND ${t.lineTotalCentimes} = ${t.unitPriceCentimes} * ${t.quantity}`,
    ),
    index('order_items_order_idx').on(t.orderId),
  ],
);

/** APPEND-ONLY (UPDATE/DELETE blocked by trigger). */
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: pk(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    fromStatus: orderStatusEnum('from_status'),
    toStatus: orderStatusEnum('to_status').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    actorRole: roleEnum('actor_role'),
    reason: text('reason'),
    metadata: jsonb('metadata'),
    createdAt: createdAt(),
  },
  (t) => [index('order_history_order_created_idx').on(t.orderId, t.createdAt)],
);
