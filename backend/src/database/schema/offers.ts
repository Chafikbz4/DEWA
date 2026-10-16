import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, money, pk, tstz, updatedAt } from './_columns';
import {
  itemAvailabilityEnum,
  offerStatusEnum,
  patientApprovalEnum,
} from './enums';
import { medicines } from './catalog';
import { pharmacies } from './pharmacy';
import { requestItems, requests } from './requests';

export const offers = pgTable(
  'offers',
  {
    id: pk(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'restrict' }),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'restrict' }),
    status: offerStatusEnum('status').notNull().default('DRAFT'),
    itemsSubtotalCentimes: money('items_subtotal_centimes')
      .notNull()
      .default(0),
    deliveryFeeCentimes: money('delivery_fee_centimes').notNull().default(0),
    serviceFeeCentimes: money('service_fee_centimes').notNull().default(0),
    totalCentimes: money('total_centimes').notNull().default(0),
    preparationMinutes: integer('preparation_minutes'),
    validUntil: tstz('valid_until'),
    deliveryAvailable: boolean('delivery_available').notNull().default(false),
    pharmacyNote: text('pharmacy_note'),
    requiresPrescriptionOriginal: boolean('requires_prescription_original')
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    sentAt: tstz('sent_at'),
  },
  (t) => [
    check(
      'offers_money_chk',
      sql`${t.itemsSubtotalCentimes} >= 0 AND ${t.deliveryFeeCentimes} >= 0 AND ${t.serviceFeeCentimes} >= 0 AND ${t.totalCentimes} >= 0`,
    ),
    check(
      'offers_total_chk',
      sql`${t.totalCentimes} = ${t.itemsSubtotalCentimes} + ${t.deliveryFeeCentimes} + ${t.serviceFeeCentimes}`,
    ),
    check(
      'offers_preparation_chk',
      sql`${t.preparationMinutes} IS NULL OR ${t.preparationMinutes} >= 0`,
    ),
    index('offers_request_idx').on(t.requestId, t.status),
    index('offers_pharmacy_status_created_idx').on(
      t.pharmacyId,
      t.status,
      t.createdAt,
    ),
  ],
);

export const offerItems = pgTable(
  'offer_items',
  {
    id: pk(),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offers.id, { onDelete: 'cascade' }),
    requestItemId: uuid('request_item_id').references(() => requestItems.id, {
      onDelete: 'set null',
    }),
    medicineId: uuid('medicine_id').references(() => medicines.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 255 }).notNull(),
    quantityRequested: integer('quantity_requested').notNull().default(0),
    quantityOffered: integer('quantity_offered').notNull().default(0),
    unitPriceCentimes: money('unit_price_centimes').notNull().default(0),
    lineTotalCentimes: money('line_total_centimes').notNull().default(0),
    availability: itemAvailabilityEnum('availability').notNull(),
    isAlternative: boolean('is_alternative').notNull().default(false),
    alternativeReason: text('alternative_reason'),
    patientApproval: patientApprovalEnum('patient_approval')
      .notNull()
      .default('NOT_REQUIRED'),
  },
  (t) => [
    check(
      'offer_items_qty_chk',
      sql`${t.quantityRequested} >= 0 AND ${t.quantityOffered} >= 0`,
    ),
    check(
      'offer_items_money_chk',
      sql`${t.unitPriceCentimes} >= 0 AND ${t.lineTotalCentimes} >= 0`,
    ),
    check(
      'offer_items_line_total_chk',
      sql`${t.lineTotalCentimes} = ${t.unitPriceCentimes} * ${t.quantityOffered}`,
    ),
    index('offer_items_offer_idx').on(t.offerId),
  ],
);
