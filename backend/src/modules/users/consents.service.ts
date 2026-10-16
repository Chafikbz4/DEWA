import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { Database, DbOrTx, DRIZZLE } from '../../database/database.module';
import { ConsentType, consentRecords } from '../../database/schema';
import { AuditAction, AuditService } from '../audit/audit.service';

export interface ConsentInput {
  type: ConsentType;
  version: string;
}

/** TERMS and PRIVACY are required to use the service and cannot be revoked. */
export const REQUIRED_CONSENTS: readonly ConsentType[] = ['TERMS', 'PRIVACY'];

const present = (r: typeof consentRecords.$inferSelect) => ({
  id: r.id,
  type: r.consentType,
  version: r.version,
  granted_at: r.grantedAt,
  revoked_at: r.revokedAt,
  active: !r.revokedAt,
});

@Injectable()
export class ConsentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  currentVersion(type: ConsentType): string | null {
    if (type === 'TERMS')
      return this.config.get<string>('CONSENT_TERMS_VERSION', '2026-10');
    if (type === 'PRIVACY')
      return this.config.get<string>('CONSENT_PRIVACY_VERSION', '2026-10');
    return null; // other consents accept any declared version
  }

  /** Registration: TERMS + PRIVACY at current versions, no duplicates. */
  assertRegistrationConsents(consents: ConsentInput[]) {
    const types = consents.map((c) => c.type);
    if (new Set(types).size !== types.length)
      throw new AppException('VALIDATION_FAILED', [
        {
          field: 'consents',
          errors: [
            { rule: 'arrayUnique', message_key: 'validation.arrayUnique' },
          ],
        },
      ]);
    for (const required of REQUIRED_CONSENTS) {
      const c = consents.find((x) => x.type === required);
      if (!c) throw new AppException('AUTH_CONSENT_REQUIRED');
      if (c.version !== this.currentVersion(required)) {
        throw new AppException('AUTH_CONSENT_VERSION_OUTDATED', {
          type: required,
          current_version: this.currentVersion(required),
        });
      }
    }
  }

  async insertMany(
    tx: DbOrTx,
    userId: string,
    consents: ConsentInput[],
    ip: string | null,
  ) {
    if (!consents.length) return;
    await tx.insert(consentRecords).values(
      consents.map((c) => ({
        userId,
        consentType: c.type,
        version: c.version,
        ip,
      })),
    );
  }

  async list(
    user: AuthUser,
    q: {
      page: number;
      limit: number;
      offset: number;
      order: 'asc' | 'desc';
      type?: ConsentType;
      active?: boolean;
    },
  ) {
    const conditions = [eq(consentRecords.userId, user.id)];
    if (q.type) conditions.push(eq(consentRecords.consentType, q.type));
    if (q.active === true) conditions.push(isNull(consentRecords.revokedAt));
    const where = and(...conditions);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(consentRecords)
        .where(where)
        .orderBy(
          q.order === 'asc'
            ? consentRecords.grantedAt
            : desc(consentRecords.grantedAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(consentRecords).where(where),
    ]);
    return Paginated.of(rows.map(present), total, q.page, q.limit);
  }

  async grant(user: AuthUser, input: ConsentInput, meta: RequestMeta) {
    const current = this.currentVersion(input.type);
    if (current && input.version !== current) {
      throw new AppException('AUTH_CONSENT_VERSION_OUTDATED', {
        type: input.type,
        current_version: current,
      });
    }
    const [existing] = await this.db
      .select()
      .from(consentRecords)
      .where(
        and(
          eq(consentRecords.userId, user.id),
          eq(consentRecords.consentType, input.type),
          eq(consentRecords.version, input.version),
          isNull(consentRecords.revokedAt),
        ),
      )
      .limit(1);
    if (existing) return present(existing); // idempotent

    const [row] = await this.db
      .insert(consentRecords)
      .values({
        userId: user.id,
        consentType: input.type,
        version: input.version,
        ip: meta.ip,
      })
      .returning();
    await this.audit.log({
      action: AuditAction.CONSENT_GRANTED,
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'consent',
      resourceId: row.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { type: input.type, version: input.version },
    });
    return present(row);
  }

  async revoke(user: AuthUser, type: ConsentType, meta: RequestMeta) {
    if (REQUIRED_CONSENTS.includes(type))
      throw new AppException('CONSENT_REQUIRED_NOT_REVOCABLE');
    const rows = await this.db
      .update(consentRecords)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(consentRecords.userId, user.id),
          eq(consentRecords.consentType, type),
          isNull(consentRecords.revokedAt),
        ),
      )
      .returning();
    if (!rows.length) throw new AppException('CONSENT_NOT_FOUND');
    await this.audit.log({
      action: AuditAction.CONSENT_REVOKED,
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'consent',
      resourceId: rows[0].id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { type, records: rows.length },
    });
    return { type, revoked: rows.length };
  }
}
