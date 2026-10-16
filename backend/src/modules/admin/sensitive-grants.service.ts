import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gt, isNull, SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { Database, DbOrTx, DRIZZLE } from '../../database/database.module';
import {
  conversations,
  requests,
  sensitiveAccessGrants,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import {
  SensitiveAccessService,
  SensitiveResource,
} from '../audit/sensitive-access.service';
import { SettingsService } from '../settings/settings.service';

export type GrantResource = 'REQUEST' | 'CONVERSATION';
type GrantRow = typeof sensitiveAccessGrants.$inferSelect;

/** Which sensitive_access_logs type a grant / read is recorded under. */
export const LOG_TYPE: Record<GrantResource, SensitiveResource> = {
  REQUEST: 'PRESCRIPTION',
  CONVERSATION: 'CONVERSATION',
};

const present = (g: GrantRow) => ({
  id: g.id,
  admin_user_id: g.adminUserId,
  resource_type: g.resourceType,
  resource_id: g.resourceId,
  justification: g.justification,
  expires_at: g.expiresAt,
  revoked_at: g.revokedAt,
  active: !g.revokedAt && g.expiresAt > new Date(),
  created_at: g.createdAt,
});

/**
 * Break-glass access for admins: prescription / Chifa content of a request,
 * or a conversation, is readable only with an active, time-limited grant
 * created with a justification. Every grant and every read is recorded in
 * sensitive_access_logs and the audit log.
 */
@Injectable()
export class SensitiveGrantsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly sensitive: SensitiveAccessService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async create(
    admin: AuthUser,
    dto: {
      resource_type: GrantResource;
      resource_id: string;
      justification: string;
    },
    meta: RequestMeta,
  ) {
    const exists =
      dto.resource_type === 'REQUEST'
        ? (
            await this.db
              .select({ id: requests.id })
              .from(requests)
              .where(eq(requests.id, dto.resource_id))
              .limit(1)
          ).length
        : (
            await this.db
              .select({ id: conversations.id })
              .from(conversations)
              .where(eq(conversations.id, dto.resource_id))
              .limit(1)
          ).length;
    if (!exists) throw new AppException('NOT_FOUND');
    const minutes = await this.settings.get('sensitive_access_grant_minutes');
    const g = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(sensitiveAccessGrants)
        .values({
          adminUserId: admin.id,
          resourceType: dto.resource_type,
          resourceId: dto.resource_id,
          justification: dto.justification,
          expiresAt: new Date(Date.now() + minutes * 60_000),
        })
        .returning();
      await this.sensitive.record(
        admin,
        LOG_TYPE[dto.resource_type],
        dto.resource_id,
        {
          justification: dto.justification,
          ip: meta.ip,
          userAgent: meta.userAgent,
          detail: `grant:${row.id}`,
        },
        tx,
      );
      return row;
    });
    return present(g);
  }

  /** The active grant of this admin for the resource, or 403 SENSITIVE_ACCESS_GRANT_REQUIRED. */
  async assertActive(
    admin: Pick<AuthUser, 'id'>,
    type: GrantResource,
    resourceId: string,
    tx: DbOrTx = this.db,
  ) {
    const [g] = await tx
      .select()
      .from(sensitiveAccessGrants)
      .where(
        and(
          eq(sensitiveAccessGrants.adminUserId, admin.id),
          eq(sensitiveAccessGrants.resourceType, type),
          eq(sensitiveAccessGrants.resourceId, resourceId),
          isNull(sensitiveAccessGrants.revokedAt),
          gt(sensitiveAccessGrants.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(sensitiveAccessGrants.expiresAt))
      .limit(1);
    if (!g)
      throw new AppException('SENSITIVE_ACCESS_GRANT_REQUIRED', {
        resource_type: type,
        resource_id: resourceId,
      });
    return g;
  }

  /** Non-throwing variant used by file access rules. */
  async hasActive(adminId: string, type: GrantResource, resourceId: string) {
    return this.assertActive({ id: adminId }, type, resourceId).then(
      (g) => g,
      () => null,
    );
  }

  async list(
    admin: AuthUser,
    q: {
      page: number;
      limit: number;
      offset: number;
      all?: boolean;
      active?: boolean;
    },
    canSeeAll: boolean,
  ) {
    const conditions: SQL[] = [];
    if (!(q.all && canSeeAll))
      conditions.push(eq(sensitiveAccessGrants.adminUserId, admin.id));
    if (q.active)
      conditions.push(
        isNull(sensitiveAccessGrants.revokedAt),
        gt(sensitiveAccessGrants.expiresAt, new Date()),
      );
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(sensitiveAccessGrants)
        .where(where)
        .orderBy(desc(sensitiveAccessGrants.createdAt))
        .limit(q.limit)
        .offset(q.offset),
      this.db
        .select({ total: count() })
        .from(sensitiveAccessGrants)
        .where(where),
    ]);
    return Paginated.of(rows.map(present), total, q.page, q.limit);
  }

  async revoke(admin: AuthUser, id: string, meta: RequestMeta) {
    const [g] = await this.db
      .select()
      .from(sensitiveAccessGrants)
      .where(eq(sensitiveAccessGrants.id, id))
      .limit(1);
    if (!g || (g.adminUserId !== admin.id && admin.role !== 'SUPER_ADMIN'))
      throw new AppException('NOT_FOUND');
    const [row] = await this.db
      .update(sensitiveAccessGrants)
      .set({ revokedAt: g.revokedAt ?? new Date() })
      .where(eq(sensitiveAccessGrants.id, id))
      .returning();
    await this.audit.log({
      action: 'SENSITIVE_ACCESS_GRANT_REVOKED',
      actorUserId: admin.id,
      actorRole: admin.role,
      resourceType: 'sensitive_access_grant',
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return present(row);
  }
}
