import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, money, pk, tstz, updatedAt } from './_columns';
import { medicineCategoryEnum, stockStatusEnum } from './enums';
import { users } from './identity';
import { pharmacies } from './pharmacy';

export const medicines = pgTable(
  'medicines',
  {
    id: pk(),
    brandName: varchar('brand_name', { length: 200 }).notNull(),
    /** Arabic commercial name (optional). */
    nameAr: varchar('name_ar', { length: 200 }),
    /** International non-proprietary name (DCI). */
    innDci: varchar('inn_dci', { length: 200 }),
    form: varchar('form', { length: 100 }),
    dosage: varchar('dosage', { length: 100 }),
    packSize: varchar('pack_size', { length: 100 }),
    manufacturer: varchar('manufacturer', { length: 200 }),
    category: medicineCategoryEnum('category').notNull(),
    requiresPrescription: boolean('requires_prescription')
      .notNull()
      .default(true),
    /** Informational only – never used to compute reimbursement. */
    reimbursableFlag: boolean('reimbursable_flag').notNull().default(false),
    regulatoryCode: varchar('regulatory_code', { length: 100 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('medicines_brand_idx').on(t.brandName),
    // Trigram indexes for fuzzy search (fr / ar / DCI). Requires pg_trgm (migration 0005).
    index('medicines_brand_trgm_idx').using(
      'gin',
      t.brandName.op('gin_trgm_ops'),
    ),
    index('medicines_name_ar_trgm_idx').using(
      'gin',
      t.nameAr.op('gin_trgm_ops'),
    ),
    index('medicines_inn_trgm_idx').using('gin', t.innDci.op('gin_trgm_ops')),
    index('medicines_inn_idx').on(t.innDci),
    index('medicines_category_idx').on(t.category, t.isActive),
    uniqueIndex('medicines_regulatory_code_uq').on(t.regulatoryCode),
  ],
);

export const pharmacyStock = pgTable(
  'pharmacy_stock',
  {
    id: pk(),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'cascade' }),
    medicineId: uuid('medicine_id')
      .notNull()
      .references(() => medicines.id, { onDelete: 'restrict' }),
    stockStatus: stockStatusEnum('stock_status').notNull(),
    quantity: integer('quantity'),
    unitPriceCentimes: money('unit_price_centimes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('pharmacy_stock_pharmacy_medicine_uq').on(
      t.pharmacyId,
      t.medicineId,
    ),
    index('pharmacy_stock_medicine_status_idx').on(t.medicineId, t.stockStatus),
    check(
      'pharmacy_stock_quantity_chk',
      sql`${t.quantity} IS NULL OR ${t.quantity} >= 0`,
    ),
    check(
      'pharmacy_stock_price_chk',
      sql`${t.unitPriceCentimes} IS NULL OR ${t.unitPriceCentimes} >= 0`,
    ),
  ],
);

/**
 * What the platform allows per medicine category. Everything defaults to
 * disabled; CONTROLLED / PSYCHOTROPIC / COLD_CHAIN must stay disabled until a
 * documented legal basis exists.
 */
export const eligibilityPolicies = pgTable(
  'eligibility_policies',
  {
    id: pk(),
    name: varchar('name', { length: 200 }).notNull(),
    appliesToCategory: medicineCategoryEnum('applies_to_category').notNull(),
    allowedOnlineRequest: boolean('allowed_online_request')
      .notNull()
      .default(false),
    allowedOnlinePayment: boolean('allowed_online_payment')
      .notNull()
      .default(false),
    allowedDelivery: boolean('allowed_delivery').notNull().default(false),
    requiresPharmacistValidation: boolean('requires_pharmacist_validation')
      .notNull()
      .default(true),
    requiresOriginalPrescription: boolean('requires_original_prescription')
      .notNull()
      .default(true),
    legalBasisReference: text('legal_basis_reference'),
    isEnabled: boolean('is_enabled').notNull().default(false),
    reviewedBy: uuid('reviewed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: tstz('reviewed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    /** At most one enabled policy per category. */
    uniqueIndex('eligibility_one_enabled_per_category_uq')
      .on(t.appliesToCategory)
      .where(sql`${t.isEnabled} = true`),
    /** An enabled policy must have been reviewed and cite a legal basis. */
    check(
      'eligibility_enabled_requires_review_chk',
      sql`${t.isEnabled} = false OR (${t.reviewedBy} IS NOT NULL AND ${t.reviewedAt} IS NOT NULL AND ${t.legalBasisReference} IS NOT NULL)`,
    ),
  ],
);
