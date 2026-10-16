import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  jsonb,
  pgSequence,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, money, pk, tstz, updatedAt } from './_columns';
import {
  commissionScopeEnum,
  commissionTypeEnum,
  paymentProviderEnum,
  paymentStatusEnum,
  refundStatusEnum,
  settlementStatusEnum,
} from './enums';
import { files } from './files';
import { users } from './identity';
import { orders } from './orders';
import { pharmacies } from './pharmacy';

export const receiptNumberSeq = pgSequence('receipt_number_seq', {
  startWith: 1,
  increment: 1,
});

export const payments = pgTable(
  'payments',
  {
    id: pk(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    provider: paymentProviderEnum('provider').notNull(),
    providerReference: varchar('provider_reference', { length: 128 }),
    providerOrderId: varchar('provider_order_id', { length: 128 }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    amountCentimes: money('amount_centimes').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('DZD'),
    status: paymentStatusEnum('status').notNull().default('INITIATED'),
    /** Set only after the server confirmed the result with the provider. */
    verifiedServerSideAt: tstz('verified_server_side_at'),
    failureCode: varchar('failure_code', { length: 64 }),
    rawProviderResponseEncrypted: text('raw_provider_response_encrypted'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('payments_idempotency_key_uq').on(t.idempotencyKey),
    uniqueIndex('payments_provider_order_uq').on(t.provider, t.providerOrderId),
    check('payments_amount_chk', sql`${t.amountCentimes} >= 0`),
    check('payments_currency_chk', sql`${t.currency} = 'DZD'`),
    check(
      'payments_confirmed_verified_chk',
      sql`${t.status} <> 'CONFIRMED' OR ${t.verifiedServerSideAt} IS NOT NULL`,
    ),
    index('payments_order_idx').on(t.orderId),
    index('payments_status_created_idx').on(t.status, t.createdAt),
  ],
);

export const paymentEvents = pgTable(
  'payment_events',
  {
    id: pk(),
    paymentId: uuid('payment_id').references(() => payments.id, {
      onDelete: 'set null',
    }),
    providerEventId: varchar('provider_event_id', { length: 128 }).notNull(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    payload: jsonb('payload'),
    signatureValid: boolean('signature_valid').notNull().default(false),
    processedAt: tstz('processed_at'),
    processingResult: varchar('processing_result', { length: 255 }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('payment_events_provider_event_uq').on(t.providerEventId),
    index('payment_events_payment_idx').on(t.paymentId),
  ],
);

export const refunds = pgTable(
  'refunds',
  {
    id: pk(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    amountCentimes: money('amount_centimes').notNull(),
    reason: text('reason').notNull(),
    status: refundStatusEnum('status').notNull().default('REQUESTED'),
    requestedBy: uuid('requested_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedByAdminId: uuid('approved_by_admin_id').references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    providerRefundReference: varchar('provider_refund_reference', {
      length: 128,
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: tstz('completed_at'),
  },
  (t) => [
    check('refunds_amount_chk', sql`${t.amountCentimes} > 0`),
    index('refunds_payment_idx').on(t.paymentId),
    index('refunds_order_idx').on(t.orderId),
    index('refunds_status_created_idx').on(t.status, t.createdAt),
  ],
);

export const receipts = pgTable(
  'receipts',
  {
    id: pk(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    paymentId: uuid('payment_id').references(() => payments.id, {
      onDelete: 'restrict',
    }),
    receiptNumber: varchar('receipt_number', { length: 32 }).notNull(),
    issuedAt: tstz('issued_at').notNull().defaultNow(),
    fileId: uuid('file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    dataSnapshot: jsonb('data_snapshot').notNull(),
  },
  (t) => [
    uniqueIndex('receipts_number_uq').on(t.receiptNumber),
    index('receipts_order_idx').on(t.orderId),
  ],
);

/**
 * value semantics: PERCENT = basis points (500 = 5.00 %),
 * FIXED / SUBSCRIPTION = centimes of DZD.
 */
export const commissionRules = pgTable(
  'commission_rules',
  {
    id: pk(),
    scope: commissionScopeEnum('scope').notNull(),
    pharmacyId: uuid('pharmacy_id').references(() => pharmacies.id, {
      onDelete: 'cascade',
    }),
    type: commissionTypeEnum('type').notNull(),
    value: money('value').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    legalReviewNote: text('legal_review_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('commission_value_chk', sql`${t.value} >= 0`),
    check(
      'commission_percent_range_chk',
      sql`${t.type} <> 'PERCENT' OR ${t.value} <= 10000`,
    ),
    check(
      'commission_scope_pharmacy_chk',
      sql`(${t.scope} = 'GLOBAL' AND ${t.pharmacyId} IS NULL) OR (${t.scope} = 'PHARMACY' AND ${t.pharmacyId} IS NOT NULL)`,
    ),
    index('commission_rules_pharmacy_idx').on(t.pharmacyId, t.isActive),
  ],
);

export const settlements = pgTable(
  'settlements',
  {
    id: pk(),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'restrict' }),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    grossCentimes: money('gross_centimes').notNull().default(0),
    commissionCentimes: money('commission_centimes').notNull().default(0),
    refundsCentimes: money('refunds_centimes').notNull().default(0),
    netCentimes: money('net_centimes').notNull().default(0),
    status: settlementStatusEnum('status').notNull().default('DRAFT'),
    paidAt: tstz('paid_at'),
    payoutReference: varchar('payout_reference', { length: 128 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('settlements_period_chk', sql`${t.periodEnd} >= ${t.periodStart}`),
    check(
      'settlements_money_chk',
      sql`${t.grossCentimes} >= 0 AND ${t.commissionCentimes} >= 0 AND ${t.refundsCentimes} >= 0`,
    ),
    uniqueIndex('settlements_pharmacy_period_uq').on(
      t.pharmacyId,
      t.periodStart,
      t.periodEnd,
    ),
    index('settlements_status_idx').on(t.status, t.createdAt),
  ],
);

export const settlementLines = pgTable(
  'settlement_lines',
  {
    id: pk(),
    settlementId: uuid('settlement_id')
      .notNull()
      .references(() => settlements.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    amountCentimes: money('amount_centimes').notNull(),
    commissionCentimes: money('commission_centimes').notNull(),
  },
  (t) => [
    check(
      'settlement_lines_money_chk',
      sql`${t.amountCentimes} >= 0 AND ${t.commissionCentimes} >= 0`,
    ),
    uniqueIndex('settlement_lines_settlement_order_uq').on(
      t.settlementId,
      t.orderId,
    ),
    index('settlement_lines_order_idx').on(t.orderId),
  ],
);
