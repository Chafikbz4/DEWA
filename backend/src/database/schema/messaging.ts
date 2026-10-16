import {
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, tstz } from './_columns';
import {
  conversationStatusEnum,
  messageTypeEnum,
  notificationChannelEnum,
  notificationStatusEnum,
} from './enums';
import { files } from './files';
import { users } from './identity';
import { pharmacies } from './pharmacy';
import { requests } from './requests';

export const conversations = pgTable(
  'conversations',
  {
    id: pk(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    pharmacyId: uuid('pharmacy_id')
      .notNull()
      .references(() => pharmacies.id, { onDelete: 'restrict' }),
    patientUserId: uuid('patient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: conversationStatusEnum('status').notNull().default('OPEN'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('conversations_request_pharmacy_uq').on(
      t.requestId,
      t.pharmacyId,
    ),
    index('conversations_patient_idx').on(t.patientUserId),
    index('conversations_pharmacy_idx').on(t.pharmacyId, t.status),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: pk(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    /** NULL for SYSTEM messages. */
    senderUserId: uuid('sender_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    messageType: messageTypeEnum('message_type').notNull().default('TEXT'),
    body: text('body'),
    fileId: uuid('file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    readAt: tstz('read_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('messages_conversation_created_idx').on(
      t.conversationId,
      t.createdAt,
    ),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 64 }).notNull(),
    /** i18n keys – rendered in the user's language by the client/sender. */
    titleKey: varchar('title_key', { length: 128 }).notNull(),
    bodyKey: varchar('body_key', { length: 128 }).notNull(),
    payload: jsonb('payload'),
    channel: notificationChannelEnum('channel').notNull().default('IN_APP'),
    status: notificationStatusEnum('status').notNull().default('QUEUED'),
    readAt: tstz('read_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    index('notifications_status_created_idx').on(t.status, t.createdAt),
  ],
);
