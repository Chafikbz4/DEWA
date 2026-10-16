import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, deletedAt, pk, tstz } from './_columns';
import { filePurposeEnum, malwareScanStatusEnum } from './enums';
import { users } from './identity';

export const files = pgTable(
  'files',
  {
    id: pk(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    purpose: filePurposeEnum('purpose').notNull(),
    /** Opaque object-storage key – never derived from user input. */
    storageKey: varchar('storage_key', { length: 512 }).notNull(),
    originalName: varchar('original_name', { length: 255 }),
    mimeType: varchar('mime_type', { length: 127 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    isEncrypted: boolean('is_encrypted').notNull().default(true),
    /** Reference to the key (KMS id / key version), never the key itself. */
    encryptionKeyRef: varchar('encryption_key_ref', { length: 255 }),
    malwareScanStatus: malwareScanStatusEnum('malware_scan_status')
      .notNull()
      .default('PENDING'),
    createdAt: createdAt(),
    deletedAt: deletedAt(),
    retentionUntil: tstz('retention_until'),
  },
  (t) => [
    check('files_size_chk', sql`${t.sizeBytes} >= 0`),
    uniqueIndex('files_storage_key_uq').on(t.storageKey),
    index('files_owner_idx').on(t.ownerUserId),
    index('files_purpose_created_idx').on(t.purpose, t.createdAt),
    index('files_retention_idx')
      .on(t.retentionUntil)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
);
