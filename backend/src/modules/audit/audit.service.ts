import { Inject, Injectable, Logger } from '@nestjs/common';
import { Database, DRIZZLE } from '../../database/database.module';
import { auditLogs, Role } from '../../database/schema';

export const AuditAction = {
  AUTH_REGISTERED: 'AUTH_REGISTERED',
  AUTH_LOGIN_SUCCESS: 'AUTH_LOGIN_SUCCESS',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  AUTH_MFA_FAILED: 'AUTH_MFA_FAILED',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  AUTH_LOGOUT_ALL: 'AUTH_LOGOUT_ALL',
  AUTH_SESSION_REVOKED: 'AUTH_SESSION_REVOKED',
  AUTH_REFRESH_REUSE_DETECTED: 'AUTH_REFRESH_REUSE_DETECTED',
  AUTH_PASSWORD_CHANGED: 'AUTH_PASSWORD_CHANGED',
  AUTH_PASSWORD_RESET: 'AUTH_PASSWORD_RESET',
  AUTH_MFA_ENABLED: 'AUTH_MFA_ENABLED',
  AUTH_MFA_DISABLED: 'AUTH_MFA_DISABLED',
  AUTH_IDENTIFIER_VERIFIED: 'AUTH_IDENTIFIER_VERIFIED',
  DEVICE_REGISTERED: 'DEVICE_REGISTERED',
  DEVICE_REMOVED: 'DEVICE_REMOVED',
  CONSENT_GRANTED: 'CONSENT_GRANTED',
  CONSENT_REVOKED: 'CONSENT_REVOKED',
  STAFF_INVITED: 'STAFF_INVITED',
  STAFF_INVITATION_REVOKED: 'STAFF_INVITATION_REVOKED',
  STAFF_INVITATION_ACCEPTED: 'STAFF_INVITATION_ACCEPTED',
  ADMIN_USER_CREATED: 'ADMIN_USER_CREATED',
  ADMIN_USERS_LISTED: 'ADMIN_USERS_LISTED',
  ADMIN_USER_VIEWED: 'ADMIN_USER_VIEWED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
} as const;
export type AuditActionType =
  | (typeof AuditAction)[keyof typeof AuditAction]
  // Domain modules add their own namespaced actions (e.g. REQUEST_CREATED).
  | (string & {});

export interface AuditEntry {
  action: AuditActionType;
  actorUserId?: string | null;
  actorRole?: Role | null;
  resourceType?: string;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  reason?: string | null;
  /** Never put passwords, tokens, codes or health data here. */
  metadata?: Record<string, unknown>;
}

type Executor = Pick<Database, 'insert'>;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Writes an append-only audit row. Pass `tx` to make the audit entry part of
   * the business transaction (it then rolls back with it).
   */
  async log(entry: AuditEntry, tx?: Executor): Promise<void> {
    const executor = tx ?? this.db;
    try {
      await executor.insert(auditLogs).values({
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        actorRole: entry.actorRole ?? null,
        resourceType: entry.resourceType ?? null,
        resourceId: entry.resourceId ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        reason: entry.reason ?? null,
        metadata: entry.metadata ?? null,
      });
    } catch (err) {
      if (tx) throw err;
      // Outside a transaction an audit failure must not leak details to clients,
      // but it must be visible to operators.
      this.logger.error(
        `Failed to write audit log ${entry.action}`,
        (err as Error).stack,
      );
    }
  }
}
