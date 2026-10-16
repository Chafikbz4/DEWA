import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, count, desc, eq, or } from 'drizzle-orm';
import { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { PaginationQueryDto } from '../../common/http/pagination.dto';
import { Lang } from '../../common/i18n/i18n.service';
import {
  maskIdentifier,
  NormalizedIdentifier,
  normalizeEmail,
  normalizePhone,
} from '../../common/utils/identifier';
import { Database, DRIZZLE } from '../../database/database.module';
import { pharmacies, pharmacyStaffInvitations } from '../../database/schema';
import { AuditAction, AuditService } from '../audit/audit.service';
import { InvitationDto, InviteStaffDto } from '../auth/dto/register.dto';
import { MessageSender } from '../messaging-providers/message-sender.service';

type InvitationRow = typeof pharmacyStaffInvitations.$inferSelect;

const targetOf = (
  i: Pick<InvitationRow, 'email' | 'phone'>,
): NormalizedIdentifier =>
  i.phone
    ? { type: 'PHONE', value: i.phone }
    : { type: 'EMAIL', value: i.email! };

const present = (i: InvitationRow): InvitationDto => ({
  id: i.id,
  staff_role: i.staffRole,
  target_masked: maskIdentifier(targetOf(i)),
  status:
    i.status === 'PENDING' && i.expiresAt < new Date() ? 'EXPIRED' : i.status,
  expires_at: i.expiresAt,
  created_at: i.createdAt,
});

const ROLE_LABELS: Record<string, Record<Lang, string>> = {
  PHARMACIST: { fr: 'pharmacien(ne)', ar: 'صيدلي(ة)' },
  ASSISTANT: { fr: 'assistant(e)', ar: 'مساعد(ة)' },
};

@Injectable()
export class StaffInvitationsService {
  private readonly ttlDays: number;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly crypto: CryptoService,
    private readonly sender: MessageSender,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.ttlDays = config.get<number>('STAFF_INVITATION_TTL_DAYS', 7);
  }

  async invite(
    owner: AuthUser,
    pharmacyId: string,
    dto: InviteStaffDto,
    meta: RequestMeta,
  ): Promise<InvitationDto> {
    const email = dto.email ? normalizeEmail(dto.email) : null;
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    if (!email && !phone) throw new AppException('AUTH_IDENTIFIER_REQUIRED');

    const token = this.crypto.randomToken(32);
    const expiresAt = new Date(Date.now() + this.ttlDays * 86_400_000);

    const [pharmacy] = await this.db
      .select({ nameFr: pharmacies.nameFr, nameAr: pharmacies.nameAr })
      .from(pharmacies)
      .where(eq(pharmacies.id, pharmacyId))
      .limit(1);

    const invitation = await this.db.transaction(async (tx) => {
      // A new invitation supersedes pending ones for the same person.
      const sameTarget = [
        ...(email ? [eq(pharmacyStaffInvitations.email, email)] : []),
        ...(phone ? [eq(pharmacyStaffInvitations.phone, phone)] : []),
      ];
      await tx
        .update(pharmacyStaffInvitations)
        .set({ status: 'REVOKED' })
        .where(
          and(
            eq(pharmacyStaffInvitations.pharmacyId, pharmacyId),
            eq(pharmacyStaffInvitations.status, 'PENDING'),
            or(...sameTarget),
          ),
        );
      const [row] = await tx
        .insert(pharmacyStaffInvitations)
        .values({
          pharmacyId,
          email,
          phone,
          staffRole: dto.staff_role,
          tokenHash: this.crypto.hmac(token),
          expiresAt,
          invitedBy: owner.id,
        })
        .returning();
      await this.audit.log(
        {
          action: AuditAction.STAFF_INVITED,
          actorUserId: owner.id,
          actorRole: owner.role,
          resourceType: 'pharmacy',
          resourceId: pharmacyId,
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: { invitation_id: row.id, staff_role: dto.staff_role },
        },
        tx,
      );
      return row;
    });

    const lang = owner.preferredLanguage as Lang;
    const target = targetOf(invitation);
    await this.sender.send(
      target.type,
      target.value,
      'staff_invitation',
      lang,
      {
        pharmacy: lang === 'ar' ? pharmacy.nameAr : pharmacy.nameFr,
        role: ROLE_LABELS[dto.staff_role][lang],
        token,
        days: this.ttlDays,
      },
    );
    return present(invitation);
  }

  async list(pharmacyId: string, q: PaginationQueryDto) {
    const where = eq(pharmacyStaffInvitations.pharmacyId, pharmacyId);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(pharmacyStaffInvitations)
        .where(where)
        .orderBy(
          q.order === 'asc'
            ? pharmacyStaffInvitations.createdAt
            : desc(pharmacyStaffInvitations.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db
        .select({ total: count() })
        .from(pharmacyStaffInvitations)
        .where(where),
    ]);
    return Paginated.of(rows.map(present), total, q.page, q.limit);
  }

  async revoke(
    owner: AuthUser,
    pharmacyId: string,
    invitationId: string,
    meta: RequestMeta,
  ) {
    const [row] = await this.db
      .update(pharmacyStaffInvitations)
      .set({ status: 'REVOKED' })
      .where(
        and(
          eq(pharmacyStaffInvitations.id, invitationId),
          eq(pharmacyStaffInvitations.pharmacyId, pharmacyId),
          eq(pharmacyStaffInvitations.status, 'PENDING'),
        ),
      )
      .returning();
    if (!row) throw new AppException('INVITATION_INVALID');
    await this.audit.log({
      action: AuditAction.STAFF_INVITATION_REVOKED,
      actorUserId: owner.id,
      actorRole: owner.role,
      resourceType: 'pharmacy',
      resourceId: pharmacyId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { invitation_id: invitationId },
    });
    return present(row);
  }
}
