import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, money, pk, tstz, updatedAt } from './_columns';
import {
  deliveryCompanyDocTypeEnum,
  deliveryCompanyStatusEnum,
  deliveryStatusEnum,
  documentReviewStatusEnum,
  driverDocTypeEnum,
  driverStatusEnum,
  invitationStatusEnum,
  proofTypeEnum,
  roleEnum,
  vehicleTypeEnum,
} from './enums';
import { files } from './files';
import { users } from './identity';
import { orders } from './orders';
import { communes, wilayas } from './patient';

export const deliveryCompanies = pgTable(
  'delivery_companies',
  {
    id: pk(),
    name: varchar('name', { length: 200 }).notNull(),
    legalName: varchar('legal_name', { length: 255 }),
    taxId: varchar('tax_id', { length: 30 }),
    rcNumber: varchar('rc_number', { length: 30 }),
    phone: varchar('phone', { length: 16 }),
    email: varchar('email', { length: 254 }),
    status: deliveryCompanyStatusEnum('status')
      .notNull()
      .default('PENDING_VERIFICATION'),
    /** User account of the company administrator. */
    adminUserId: uuid('admin_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    verifiedByAdminId: uuid('verified_by_admin_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    verifiedAt: tstz('verified_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('delivery_companies_status_idx').on(t.status, t.createdAt),
    uniqueIndex('delivery_companies_rc_uq').on(t.rcNumber),
  ],
);

export const deliveryCompanyDocuments = pgTable(
  'delivery_company_documents',
  {
    id: pk(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => deliveryCompanies.id, { onDelete: 'cascade' }),
    docType: deliveryCompanyDocTypeEnum('doc_type').notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    reviewStatus: documentReviewStatusEnum('review_status')
      .notNull()
      .default('PENDING'),
    reviewerAdminId: uuid('reviewer_admin_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewNote: text('review_note'),
    reviewedAt: tstz('reviewed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('delivery_company_documents_company_idx').on(t.companyId),
    index('delivery_company_documents_review_idx').on(
      t.reviewStatus,
      t.createdAt,
    ),
  ],
);

export const drivers = pgTable(
  'drivers',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** NULL = independent driver. */
    companyId: uuid('company_id').references(() => deliveryCompanies.id, {
      onDelete: 'set null',
    }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    vehicleType: vehicleTypeEnum('vehicle_type').notNull(),
    plateNumber: varchar('plate_number', { length: 20 }),
    licenseNumberEncrypted: text('license_number_encrypted'),
    status: driverStatusEnum('status')
      .notNull()
      .default('PENDING_VERIFICATION'),
    isAvailable: boolean('is_available').notNull().default(false),
    currentLatitude: doublePrecision('current_latitude'),
    currentLongitude: doublePrecision('current_longitude'),
    lastLocationAt: tstz('last_location_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('drivers_user_uq').on(t.userId),
    index('drivers_company_idx').on(t.companyId),
    index('drivers_available_idx')
      .on(t.status, t.isAvailable)
      .where(sql`${t.isAvailable} = true`),
    index('drivers_location_gix').using(
      'gist',
      sql`(ST_SetSRID(ST_MakePoint(${t.currentLongitude}, ${t.currentLatitude}), 4326)::geography)`,
    ),
  ],
);

export const driverDocuments = pgTable(
  'driver_documents',
  {
    id: pk(),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => drivers.id, { onDelete: 'cascade' }),
    docType: driverDocTypeEnum('doc_type').notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    reviewStatus: documentReviewStatusEnum('review_status')
      .notNull()
      .default('PENDING'),
    reviewerAdminId: uuid('reviewer_admin_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewNote: text('review_note'),
    reviewedAt: tstz('reviewed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('driver_documents_driver_idx').on(t.driverId),
    index('driver_documents_review_idx').on(t.reviewStatus, t.createdAt),
  ],
);

/** A company admin invites a driver (token sent by SMS / email, stored as HMAC). */
export const deliveryDriverInvitations = pgTable(
  'delivery_driver_invitations',
  {
    id: pk(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => deliveryCompanies.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 254 }),
    phone: varchar('phone', { length: 16 }),
    tokenHash: text('token_hash').notNull(),
    status: invitationStatusEnum('status').notNull().default('PENDING'),
    invitedBy: uuid('invited_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    expiresAt: tstz('expires_at').notNull(),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    acceptedAt: tstz('accepted_at'),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'driver_invitations_target_chk',
      sql`${t.email} IS NOT NULL OR ${t.phone} IS NOT NULL`,
    ),
    uniqueIndex('driver_invitations_token_hash_uq').on(t.tokenHash),
    index('driver_invitations_company_status_idx').on(t.companyId, t.status),
  ],
);

export const deliveryZones = pgTable(
  'delivery_zones',
  {
    id: pk(),
    wilayaId: smallint('wilaya_id')
      .notNull()
      .references(() => wilayas.id, { onDelete: 'restrict' }),
    /** NULL = whole wilaya. */
    communeId: integer('commune_id').references(() => communes.id, {
      onDelete: 'restrict',
    }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index('delivery_zones_wilaya_commune_idx').on(t.wilayaId, t.communeId),
  ],
);

export const deliveryFeeRules = pgTable(
  'delivery_fee_rules',
  {
    id: pk(),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => deliveryZones.id, { onDelete: 'cascade' }),
    baseFeeCentimes: money('base_fee_centimes').notNull(),
    perKmCentimes: money('per_km_centimes').notNull().default(0),
    minFeeCentimes: money('min_fee_centimes'),
    maxFeeCentimes: money('max_fee_centimes'),
    effectiveFrom: tstz('effective_from').notNull().defaultNow(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'fee_rules_money_chk',
      sql`${t.baseFeeCentimes} >= 0 AND ${t.perKmCentimes} >= 0 AND (${t.minFeeCentimes} IS NULL OR ${t.minFeeCentimes} >= 0) AND (${t.maxFeeCentimes} IS NULL OR ${t.maxFeeCentimes} >= 0)`,
    ),
    check(
      'fee_rules_min_max_chk',
      sql`${t.minFeeCentimes} IS NULL OR ${t.maxFeeCentimes} IS NULL OR ${t.maxFeeCentimes} >= ${t.minFeeCentimes}`,
    ),
    index('fee_rules_zone_active_idx').on(
      t.zoneId,
      t.isActive,
      t.effectiveFrom,
    ),
  ],
);

/**
 * Snapshots deliberately exclude prescription / medical data.
 * package_label is opaque (no medicine names).
 */
export const deliveries = pgTable(
  'deliveries',
  {
    id: pk(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    driverId: uuid('driver_id').references(() => drivers.id, {
      onDelete: 'set null',
    }),
    companyId: uuid('company_id').references(() => deliveryCompanies.id, {
      onDelete: 'set null',
    }),
    status: deliveryStatusEnum('status').notNull().default('AVAILABLE'),
    /** { pharmacy_name, address, phone, latitude, longitude } */
    pickupSnapshot: jsonb('pickup_snapshot').notNull(),
    /** { first_name, phone, address, latitude, longitude, notes } */
    dropoffSnapshot: jsonb('dropoff_snapshot').notNull(),
    packageLabel: varchar('package_label', { length: 64 }).notNull(),
    deliveryFeeCentimes: money('delivery_fee_centimes').notNull().default(0),
    driverPayoutCentimes: money('driver_payout_centimes').notNull().default(0),
    pickupCodeHash: text('pickup_code_hash'),
    pickupCodeAttempts: smallint('pickup_code_attempts').notNull().default(0),
    /** OTP the patient gives the driver at hand-over. */
    deliveryCodeHash: text('delivery_code_hash'),
    deliveryCodeAttempts: smallint('delivery_code_attempts')
      .notNull()
      .default(0),
    /** Attempts reported by the driver when the delivery failed. */
    deliveryAttempts: smallint('delivery_attempts').notNull().default(0),
    assignedAt: tstz('assigned_at'),
    pickedUpAt: tstz('picked_up_at'),
    deliveredAt: tstz('delivered_at'),
    estimatedArrivalAt: tstz('estimated_arrival_at'),
    failureReason: text('failure_reason'),
    /** Driver says the parcel is back; the pharmacy confirms with return_confirmed_at. */
    returnedByDriverAt: tstz('returned_by_driver_at'),
    returnConfirmedAt: tstz('return_confirmed_at'),
    proofType: proofTypeEnum('proof_type'),
    proofFileId: uuid('proof_file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('deliveries_order_uq').on(t.orderId),
    check(
      'deliveries_money_chk',
      sql`${t.deliveryFeeCentimes} >= 0 AND ${t.driverPayoutCentimes} >= 0`,
    ),
    check('deliveries_version_chk', sql`${t.version} >= 1`),
    check(
      'deliveries_attempts_chk',
      sql`${t.pickupCodeAttempts} >= 0 AND ${t.deliveryCodeAttempts} >= 0 AND ${t.deliveryAttempts} >= 0`,
    ),
    index('deliveries_status_created_idx').on(t.status, t.createdAt),
    index('deliveries_driver_status_idx').on(t.driverId, t.status),
    index('deliveries_company_status_idx').on(t.companyId, t.status),
  ],
);

/** APPEND-ONLY (UPDATE/DELETE blocked by trigger). */
export const deliveryStatusHistory = pgTable(
  'delivery_status_history',
  {
    id: pk(),
    deliveryId: uuid('delivery_id')
      .notNull()
      .references(() => deliveries.id, { onDelete: 'restrict' }),
    fromStatus: deliveryStatusEnum('from_status'),
    toStatus: deliveryStatusEnum('to_status').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    actorRole: roleEnum('actor_role'),
    reason: text('reason'),
    metadata: jsonb('metadata'),
    createdAt: createdAt(),
  },
  (t) => [
    index('delivery_history_delivery_created_idx').on(
      t.deliveryId,
      t.createdAt,
    ),
  ],
);
