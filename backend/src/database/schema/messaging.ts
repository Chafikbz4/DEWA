import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, tstz, updatedAt } from './_columns';
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
    lastMessageAt: tstz('last_message_at'),
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
    /** e.g. { key, params } for SYSTEM messages, { offer_id, offer_item_ids } for substitution proposals. */
    metadata: jsonb('metadata'),
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
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    sentAt: tstz('sent_at'),
    deadLetteredAt: tstz('dead_lettered_at'),
    readAt: tstz('read_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    index('notifications_status_created_idx').on(t.status, t.createdAt),
  ],
);

export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  pushEnabled: boolean('push_enabled').notNull().default(true),
  smsEnabled: boolean('sms_enabled').notNull().default(true),
  emailEnabled: boolean('email_enabled').notNull().default(true),
  /** Notification types the user muted (in-app still recorded). */
  mutedTypes: jsonb('muted_types').$type<string[]>().notNull().default([]),
  updatedAt: updatedAt(),
});

/** Background jobs that exhausted their retries (operator follow-up). */
export const jobDeadLetters = pgTable(
  'job_dead_letters',
  {
    id: pk(),
    jobName: varchar('job_name', { length: 100 }).notNull(),
    payload: jsonb('payload'),
    error: text('error'),
    createdAt: createdAt(),
  },
  (t) => [
    index('job_dead_letters_name_created_idx').on(t.jobName, t.createdAt),
  ],
);
