import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  time,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  createdAt,
  latitude,
  location,
  longitude,
  pk,
  tstz,
  updatedAt,
} from './_columns';
import {
  documentReviewStatusEnum,
  invitationStatusEnum,
  payoutAccountTypeEnum,
  pharmacyDocTypeEnum,
  pharmacyStatusEnum,
  staffRoleEnum,
} from './enums';
import { files } from './files';
import { users } from './identity';
import { communes, wilayas } from './patient';

export const pharmacies = pgTable(
  'pharmacies',
  {
    id: pk(),
    nameFr: varchar('name_fr', { length: 200 }).notNull(),
    nameAr: varchar('name_ar', { length: 200 }).notNull(),
    legalName: varchar('legal_name', { length: 255 }),
    /** Ministry of Health opening authorization number. Nullable while DRAFT. */
    authorizationNumber: varchar('authorization_number', { length: 100 }),
    taxIdNif: varchar('tax_id_nif', { length: 30 }),
    commercialRegisterRc: varchar('commercial_register_rc', { length: 30 }),
    wilayaId: smallint('wilaya_id')
      .notNull()
      .references(() => wilayas.id, { onDelete: 'restrict' }),
    communeId: integer('commune_id')
      .notNull()
      .references(() => communes.id, { onDelete: 'restrict' }),
    addressLine: varchar('address_line', { length: 255 }).notNull(),
    latitude: latitude(),
    longitude: longitude(),
    location: location(),
    phone: varchar('phone', { length: 16 }),
    email: varchar('email', { length: 254 }),
    status: pharmacyStatusEnum('status').notNull().default('DRAFT'),
    rejectionReason: text('rejection_reason'),
    verifiedAt: tstz('verified_at'),
    verifiedByAdminId: uuid('verified_by_admin_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    acceptsRequests: boolean('accepts_requests').notNull().default(false),
    deliveryAvailable: boolean('delivery_available').notNull().default(false),
    avgResponseMinutes: integer('avg_response_minutes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('pharmacies_authorization_number_uq').on(t.authorizationNumber),
    index('pharmacies_status_created_idx').on(t.status, t.createdAt),
    index('pharmacies_wilaya_commune_idx').on(t.wilayaId, t.communeId),
    index('pharmacies_location_gix').using('gist', t.location),
    check(
      'pharmacies_avg_response_chk',
      sql`${t.avgResponseMinutes} IS NULL OR ${t.avgResponseMinutes} >= 0`,
    ),
  ],
);

export const pharmacyStaff = pgTable(
  'pharmacy_staff',
  {
    id: pk(),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    staffRole: staffRoleEnum('staff_role').notNull(),
    pharmacistLicenseNumber: varchar('pharmacist_license_number', {
      length: 100,
    }),
    isActive: boolean('is_active').notNull().default(true),
    invitedBy: uuid('invited_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    joinedAt: tstz('joined_at').notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('pharmacy_staff_pharmacy_user_uq').on(t.pharmacyId, t.userId),
    /** A user works for at most one pharmacy at a time. */
    uniqueIndex('pharmacy_staff_one_active_per_user_uq')
      .on(t.userId)
      .where(sql`${t.isActive} = true`),
  ],
);

export const pharmacyStaffInvitations = pgTable(
  'pharmacy_staff_invitations',
  {
    id: pk(),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 254 }),
    phone: varchar('phone', { length: 16 }),
    staffRole: staffRoleEnum('staff_role').notNull(),
    /** HMAC-SHA256 of the invitation token. */
    tokenHash: text('token_hash').notNull(),
    status: invitationStatusEnum('status').notNull().default('PENDING'),
    expiresAt: tstz('expires_at').notNull(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    acceptedAt: tstz('accepted_at'),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'invitations_email_or_phone_chk',
      sql`${t.email} IS NOT NULL OR ${t.phone} IS NOT NULL`,
    ),
    check('invitations_not_owner_chk', sql`${t.staffRole} <> 'OWNER'`),
    uniqueIndex('invitations_token_hash_uq').on(t.tokenHash),
    index('invitations_pharmacy_status_idx').on(t.pharmacyId, t.status),
  ],
);

export const pharmacyDocuments = pgTable(
  'pharmacy_documents',
  {
    id: pk(),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'cascade' }),
    docType: pharmacyDocTypeEnum('doc_type').notNull(),
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
    index('pharmacy_documents_pharmacy_idx').on(t.pharmacyId),
    index('pharmacy_documents_review_idx').on(t.reviewStatus, t.createdAt),
  ],
);

export const pharmacyOpeningHours = pgTable(
  'pharmacy_opening_hours',
  {
    id: pk(),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'cascade' }),
    /** 0 = Sunday … 6 = Saturday */
    dayOfWeek: smallint('day_of_week').notNull(),
    openTime: time('open_time'),
    closeTime: time('close_time'),
    isClosed: boolean('is_closed').notNull().default(false),
    /** Open around the clock (garde / on-duty). */
    is24h: boolean('is_24h').notNull().default(false),
  },
  (t) => [
    check('opening_hours_day_chk', sql`${t.dayOfWeek} BETWEEN 0 AND 6`),
    uniqueIndex('opening_hours_pharmacy_day_uq').on(t.pharmacyId, t.dayOfWeek),
  ],
);

export const pharmacyOnDutySchedule = pgTable(
  'pharmacy_on_duty_schedule',
  {
    id: pk(),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'cascade' }),
    dateFrom: tstz('date_from').notNull(),
    dateTo: tstz('date_to').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('on_duty_range_chk', sql`${t.dateTo} > ${t.dateFrom}`),
    index('on_duty_pharmacy_range_idx').on(t.pharmacyId, t.dateFrom, t.dateTo),
  ],
);

export const pharmacyServiceAreas = pgTable(
  'pharmacy_service_areas',
  {
    id: pk(),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'cascade' }),
    wilayaId: smallint('wilaya_id')
      .notNull()
      .references(() => wilayas.id, { onDelete: 'restrict' }),
    /** NULL = the whole wilaya. */
    communeId: integer('commune_id').references(() => communes.id, {
      onDelete: 'restrict',
    }),
    maxRadiusKm: integer('max_radius_km'),
  },
  (t) => [
    check(
      'service_area_radius_chk',
      sql`${t.maxRadiusKm} IS NULL OR ${t.maxRadiusKm} > 0`,
    ),
    index('service_areas_pharmacy_idx').on(t.pharmacyId),
    index('service_areas_wilaya_commune_idx').on(t.wilayaId, t.communeId),
  ],
);

export const pharmacyPayoutAccounts = pgTable(
  'pharmacy_payout_accounts',
  {
    id: pk(),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'cascade' }),
    accountType: payoutAccountTypeEnum('account_type').notNull(),
    holderName: varchar('holder_name', { length: 200 }).notNull(),
    accountNumberEncrypted: text('account_number_encrypted').notNull(),
    verified: boolean('verified').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('payout_accounts_pharmacy_idx').on(t.pharmacyId)],
);
