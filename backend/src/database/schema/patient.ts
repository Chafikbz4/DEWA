import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  createdAt,
  deletedAt,
  latitude,
  location,
  longitude,
  pk,
  updatedAt,
} from './_columns';
import {
  dependantAuthorizationEnum,
  genderEnum,
  relationshipEnum,
} from './enums';
import { files } from './files';
import { users } from './identity';

// ---------- Geography ----------
export const wilayas = pgTable('wilayas', {
  /** Official wilaya code (1..58). */
  id: smallint('id').primaryKey(),
  nameFr: varchar('name_fr', { length: 100 }).notNull(),
  nameAr: varchar('name_ar', { length: 100 }).notNull(),
});

export const communes = pgTable(
  'communes',
  {
    id: integer('id').primaryKey(),
    wilayaId: smallint('wilaya_id')
      .notNull()
      .references(() => wilayas.id, { onDelete: 'restrict' }),
    nameFr: varchar('name_fr', { length: 100 }).notNull(),
    nameAr: varchar('name_ar', { length: 100 }).notNull(),
  },
  (t) => [index('communes_wilaya_idx').on(t.wilayaId)],
);

// ---------- Patient ----------
export const patientProfiles = pgTable('patient_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  dateOfBirth: date('date_of_birth'),
  gender: genderEnum('gender'),
  nationalIdEncrypted: text('national_id_encrypted'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const addresses = pgTable(
  'addresses',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 60 }),
    wilayaId: smallint('wilaya_id')
      .notNull()
      .references(() => wilayas.id, { onDelete: 'restrict' }),
    communeId: integer('commune_id')
      .notNull()
      .references(() => communes.id, { onDelete: 'restrict' }),
    streetLine: varchar('street_line', { length: 255 }).notNull(),
    buildingDetails: varchar('building_details', { length: 255 }),
    latitude: latitude(),
    longitude: longitude(),
    location: location(),
    phoneContact: varchar('phone_contact', { length: 16 }),
    deliveryNotes: varchar('delivery_notes', { length: 500 }),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('addresses_user_idx').on(t.userId),
    index('addresses_commune_idx').on(t.communeId),
    uniqueIndex('addresses_one_default_per_user_uq')
      .on(t.userId)
      .where(sql`${t.isDefault} = true AND ${t.deletedAt} IS NULL`),
    index('addresses_location_gix').using('gist', t.location),
  ],
);

export const dependants = pgTable(
  'dependants',
  {
    id: pk(),
    patientUserId: uuid('patient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    dateOfBirth: date('date_of_birth'),
    relationship: relationshipEnum('relationship').notNull(),
    authorizationStatus: dependantAuthorizationEnum('authorization_status')
      .notNull()
      .default('DECLARED'),
    proofFileId: uuid('proof_file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('dependants_patient_idx').on(t.patientUserId)],
);
