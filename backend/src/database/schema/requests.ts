import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  real,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, tstz, updatedAt } from './_columns';
import {
  chifaVerificationStatusEnum,
  fileQualityStatusEnum,
  ocrStatusEnum,
  recipientStatusEnum,
  requestItemSourceEnum,
  requestStatusEnum,
  requestTypeEnum,
} from './enums';
import { files } from './files';
import { consentRecords, users } from './identity';
import { medicines } from './catalog';
import { addresses, dependants } from './patient';
import { pharmacies } from './pharmacy';

/** Feeds human-readable references, e.g. RX-2026-000123. */
export const requestReferenceSeq = pgSequence('request_reference_seq', {
  startWith: 1,
  increment: 1,
});

export const requests = pgTable(
  'requests',
  {
    id: pk(),
    reference: varchar('reference', { length: 32 }).notNull(),
    patientUserId: uuid('patient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    dependantId: uuid('dependant_id').references(() => dependants.id, {
      onDelete: 'set null',
    }),
    requestType: requestTypeEnum('request_type').notNull(),
    status: requestStatusEnum('status').notNull().default('REQUEST_SUBMITTED'),
    addressId: uuid('address_id').references(() => addresses.id, {
      onDelete: 'set null',
    }),
    /** Frozen copy of the address at submission time. */
    deliveryAddressSnapshot: jsonb('delivery_address_snapshot'),
    patientNote: text('patient_note'),
    deliveryWanted: boolean('delivery_wanted').notNull().default(false),
    consentRecordId: uuid('consent_record_id').references(
      () => consentRecords.id,
      { onDelete: 'restrict' },
    ),
    expiresAt: tstz('expires_at'),
    cancelledAt: tstz('cancelled_at'),
    cancelReason: text('cancel_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('requests_reference_uq').on(t.reference),
    index('requests_patient_created_idx').on(t.patientUserId, t.createdAt),
    index('requests_status_created_idx').on(t.status, t.createdAt),
    index('requests_expires_idx').on(t.expiresAt),
  ],
);

export const requestFiles = pgTable(
  'request_files',
  {
    id: pk(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    pageOrder: integer('page_order').notNull().default(1),
    qualityStatus: fileQualityStatusEnum('quality_status')
      .notNull()
      .default('UNCHECKED'),
    createdAt: createdAt(),
  },
  (t) => [
    check('request_files_page_order_chk', sql`${t.pageOrder} >= 1`),
    uniqueIndex('request_files_request_page_uq').on(t.requestId, t.pageOrder),
  ],
);

export const requestItems = pgTable(
  'request_items',
  {
    id: pk(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    rawName: varchar('raw_name', { length: 255 }).notNull(),
    medicineId: uuid('medicine_id').references(() => medicines.id, {
      onDelete: 'set null',
    }),
    quantity: integer('quantity').notNull().default(1),
    dosageText: varchar('dosage_text', { length: 255 }),
    source: requestItemSourceEnum('source').notNull(),
    /** 0..1, only for OCR-sourced items. Advisory. */
    ocrConfidence: real('ocr_confidence'),
    confirmedByPharmacist: boolean('confirmed_by_pharmacist')
      .notNull()
      .default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('request_items_quantity_chk', sql`${t.quantity} > 0`),
    check(
      'request_items_ocr_confidence_chk',
      sql`${t.ocrConfidence} IS NULL OR (${t.ocrConfidence} >= 0 AND ${t.ocrConfidence} <= 1)`,
    ),
    index('request_items_request_idx').on(t.requestId),
  ],
);

/** OCR output is advisory only – a pharmacist always confirms items. */
export const ocrResults = pgTable(
  'ocr_results',
  {
    id: pk(),
    requestFileId: uuid('request_file_id')
      .notNull()
      .references(() => requestFiles.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 50 }).notNull(),
    rawTextEncrypted: text('raw_text_encrypted'),
    extractedJson: jsonb('extracted_json'),
    status: ocrStatusEnum('status').notNull().default('PENDING'),
    createdAt: createdAt(),
  },
  (t) => [index('ocr_results_request_file_idx').on(t.requestFileId)],
);

export const chifaSubmissions = pgTable(
  'chifa_submissions',
  {
    id: pk(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    cardFileId: uuid('card_file_id').references(() => files.id, {
      onDelete: 'restrict',
    }),
    insuranceNumberEncrypted: text('insurance_number_encrypted'),
    holderName: varchar('holder_name', { length: 200 }),
    verificationStatus: chifaVerificationStatusEnum('verification_status')
      .notNull()
      .default('NOT_VERIFIED'),
    /** e.g. CNAS_API – only set by a real official integration. */
    verifiedVia: varchar('verified_via', { length: 50 }),
    verifiedAt: tstz('verified_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** VERIFIED is impossible without an official verification source. */
    check(
      'chifa_verified_requires_source_chk',
      sql`${t.verificationStatus} <> 'VERIFIED' OR (${t.verifiedVia} IS NOT NULL AND ${t.verifiedVia} <> 'MOCK' AND ${t.verifiedAt} IS NOT NULL)`,
    ),
    index('chifa_request_idx').on(t.requestId),
  ],
);

export const requestRecipients = pgTable(
  'request_recipients',
  {
    id: pk(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'restrict' }),
    status: recipientStatusEnum('status').notNull().default('SENT'),
    sentAt: tstz('sent_at').notNull().defaultNow(),
    viewedAt: tstz('viewed_at'),
    respondedAt: tstz('responded_at'),
    declineReason: text('decline_reason'),
  },
  (t) => [
    uniqueIndex('request_recipients_request_pharmacy_uq').on(
      t.requestId,
      t.pharmacyId,
    ),
    index('request_recipients_pharmacy_status_idx').on(
      t.pharmacyId,
      t.status,
      t.sentAt,
    ),
  ],
);
