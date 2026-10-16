import { Inject, Injectable } from '@nestjs/common';
import { AuthUser } from '../../common/auth/auth-user';
import { Database, DbOrTx, DRIZZLE } from '../../database/database.module';
import { sensitiveAccessLogs } from '../../database/schema';
import { AuditService } from './audit.service';

export type SensitiveResource =
  'PRESCRIPTION' | 'CHIFA' | 'PATIENT_PROFILE' | 'CONVERSATION';

/**
 * Every read of prescription / CHIFA / patient-profile content is recorded in
 * sensitive_access_logs (append-only) AND in the audit log.
 */
@Injectable()
export class SensitiveAccessService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async record(
    actor: Pick<AuthUser, 'id' | 'role'>,
    resourceType: SensitiveResource,
    resourceId: string,
    context: {
      justification?: string | null;
      ip?: string | null;
      userAgent?: string | null;
      detail?: string;
    },
    tx: DbOrTx = this.db,
  ) {
    await tx.insert(sensitiveAccessLogs).values({
      actorUserId: actor.id,
      resourceType,
      resourceId,
      justification: context.justification ?? null,
    });
    await this.audit.log(
      {
        action: 'SENSITIVE_DATA_ACCESSED',
        actorUserId: actor.id,
        actorRole: actor.role,
        resourceType: resourceType.toLowerCase(),
        resourceId,
        ip: context.ip,
        userAgent: context.userAgent,
        reason: context.justification ?? null,
        metadata: context.detail ? { detail: context.detail } : undefined,
      },
      tx === this.db ? undefined : tx,
    );
  }
}
