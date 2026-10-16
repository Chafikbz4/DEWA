import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  char,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, pk, tstz, updatedAt } from './_columns';
import {
  adminSubRoleEnum,
  complaintAgainstTypeEnum,
  complaintStatusEnum,
  retentionJobStatusEnum,
  roleEnum,
  sensitiveResourceTypeEnum,
} from './enums';
import { files } from './files';
import { users } from './identity';
import { orders } from './orders';

export const complaintReferenceSeq = pgSequence('complaint_reference_seq', {
  startWith: 1,
  increment: 1,
});

export const complaints = pgTable(
  'complaints',
  {
    id: pk(),
    reference: varchar('reference', { length: 32 }).notNull(),
    orderId: uuid('order_id').references(() => orders.id, {
      onDelete: 'set null',
    }),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    againstType: complaintAgainstTypeEnum('against_type').notNull(),
    /** Polymorphic: pharmacy / driver / user id; NULL for PLATFORM. */
    againstId: uuid('against_id'),
    category: varchar('category', { length: 64 }).notNull(),
    description: text('description').notNull(),
    status: complaintStatusEnum('status').notNull().default('OPEN'),
    assignedAdminId: uuid('assigned_admin_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolutionNote: text('resolution_note'),
    /** NONE | REFUND | WARNING | SUSPENSION */
    resolutionOutcome: varchar('resolution_outcome', { length: 16 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    resolvedAt: tstz('resolved_at'),
  },
  (t) => [
    uniqueIndex('complaints_reference_uq').on(t.reference),
    index('complaints_status_created_idx').on(t.status, t.createdAt),
    index('complaints_reporter_idx').on(t.reporterUserId),
    index('complaints_against_idx').on(t.againstType, t.againstId),
    index('complaints_assigned_idx').on(t.assignedAdminId),
  ],
);

export const complaintMessages = pgTable(
  'complaint_messages',
  {
    id: pk(),
    complaintId: uuid('complaint_id')
      .notNull()
      .references(() => complaints.id, { onDelete: 'cascade' }),
    senderUserId: uuid('sender_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    body: text('body').notNull(),
    fileId: uuid('file_id').references(() => files.id, {
      onDelete: 'set null',
    }),
    /** Admin-only note, never shown to the parties. */
    isInternal: boolean('is_internal').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('complaint_messages_complaint_created_idx').on(
      t.complaintId,
      t.createdAt,
    ),
  ],
);

/** APPEND-ONLY (UPDATE/DELETE blocked by trigger). */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: pk(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    actorRole: roleEnum('actor_role'),
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 64 }),
    resourceId: varchar('resource_id', { length: 64 }),
    ip: varchar('ip', { length: 45 }),
    userAgent: varchar('user_agent', { length: 512 }),
    /** Required (app-enforced) for sensitive-data access. */
    reason: text('reason'),
    metadata: jsonb('metadata'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_actor_created_idx').on(t.actorUserId, t.createdAt),
    index('audit_resource_idx').on(t.resourceType, t.resourceId),
    index('audit_action_created_idx').on(t.action, t.createdAt),
  ],
);

/** APPEND-ONLY (UPDATE/DELETE blocked by trigger). */
export const sensitiveAccessLogs = pgTable(
  'sensitive_access_logs',
  {
    id: pk(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    resourceType: sensitiveResourceTypeEnum('resource_type').notNull(),
    resourceId: uuid('resource_id').notNull(),
    /** Required (app-enforced) when the actor is an admin. */
    justification: text('justification'),
    createdAt: createdAt(),
  },
  (t) => [
    index('sensitive_access_actor_created_idx').on(t.actorUserId, t.createdAt),
    index('sensitive_access_resource_idx').on(t.resourceType, t.resourceId),
  ],
);

export const platformSettings = pgTable('platform_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: jsonb('value').notNull(),
  description: text('description'),
  updatedBy: uuid('updated_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  updatedAt: updatedAt(),
});

export const dataRetentionJobs = pgTable(
  'data_retention_jobs',
  {
    id: pk(),
    resourceType: varchar('resource_type', { length: 64 }).notNull(),
    runAt: tstz('run_at').notNull().defaultNow(),
    recordsDeleted: integer('records_deleted').notNull().default(0),
    status: retentionJobStatusEnum('status').notNull().default('RUNNING'),
    errorMessage: text('error_message'),
  },
  (t) => [index('retention_jobs_resource_run_idx').on(t.resourceType, t.runAt)],
);

/** Idempotency-Key storage (24 h): first response replayed for identical retries. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 120 }).notNull(),
    key: varchar('key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    /** IN_PROGRESS | COMPLETED */
    status: varchar('status', { length: 20 }).notNull(),
    response: jsonb('response'),
    createdAt: createdAt(),
    expiresAt: tstz('expires_at').notNull(),
  },
  (t) => [
    uniqueIndex('idempotency_user_scope_key_uq').on(t.userId, t.scope, t.key),
    index('idempotency_expires_idx').on(t.expiresAt),
  ],
);

// ---------- Admin least privilege ----------

/** Permissions of each admin sub-role (seeded with the defaults, editable by SUPER_ADMIN). */
export const adminRolePermissions = pgTable(
  'admin_role_permissions',
  {
    adminRole: adminSubRoleEnum('admin_role').notNull(),
    permission: varchar('permission', { length: 64 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.adminRole, t.permission] })],
);

/** Sub-roles held by ADMIN accounts. */
export const adminUserRoles = pgTable(
  'admin_user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    adminRole: adminSubRoleEnum('admin_role').notNull(),
    grantedBy: uuid('granted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.adminRole] })],
);

/** Time-limited, justified admin access to sensitive content (break-glass). */
export const sensitiveAccessGrants = pgTable(
  'sensitive_access_grants',
  {
    id: pk(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** REQUEST | CONVERSATION */
    resourceType: varchar('resource_type', { length: 16 }).notNull(),
    resourceId: uuid('resource_id').notNull(),
    justification: text('justification').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    revokedAt: tstz('revoked_at'),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'sensitive_grants_type_chk',
      sql`${t.resourceType} IN ('REQUEST','CONVERSATION')`,
    ),
    index('sensitive_grants_lookup_idx').on(
      t.adminUserId,
      t.resourceType,
      t.resourceId,
      t.expiresAt,
    ),
  ],
);

/** APPEND-ONLY history of platform setting changes. */
export const platformSettingChanges = pgTable(
  'platform_setting_changes',
  {
    id: pk(),
    key: varchar('key', { length: 100 }).notNull(),
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value').notNull(),
    changedBy: uuid('changed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('setting_changes_key_created_idx').on(t.key, t.createdAt)],
);

/** Admin overrides of notification texts (fallback: i18n defaults). */
export const notificationTemplates = pgTable(
  'notification_templates',
  {
    type: varchar('type', { length: 64 }).notNull(),
    lang: char('lang', { length: 2 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: varchar('body', { length: 1000 }).notNull(),
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.type, t.lang] }),
    check('notification_templates_lang_chk', sql`${t.lang} IN ('ar','fr')`),
  ],
);
