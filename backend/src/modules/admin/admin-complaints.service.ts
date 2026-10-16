import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { Permission, PERMISSIONS } from '../../common/auth/permissions';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  complaintMessages,
  complaints,
  drivers,
  pharmacies,
  pharmacyStaff,
  users,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/services/token.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RefundsService } from '../payments/refunds.service';

type ComplaintRow = typeof complaints.$inferSelect;
export type ComplaintOutcome = 'NONE' | 'REFUND' | 'WARNING' | 'SUSPENSION';
const CLOSED = ['RESOLVED', 'REJECTED'];

/**
 * Complaint / dispute handling for admins: queue, assignment, status, internal
 * notes (never shown to the parties) and resolution with an outcome.
 * REFUND creates a refund REQUEST (approved separately in the refund queue –
 * separation of duties); SUSPENSION additionally requires users.manage.
 */
@Injectable()
export class AdminComplaintsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly refunds: RefundsService,
    private readonly tokens: TokenService,
  ) {}

  private summary(c: ComplaintRow) {
    return {
      id: c.id,
      reference: c.reference,
      order_id: c.orderId,
      reporter_user_id: c.reporterUserId,
      against_type: c.againstType,
      against_id: c.againstId,
      category: c.category,
      status: c.status,
      assigned_admin_id: c.assignedAdminId,
      resolution_outcome: c.resolutionOutcome,
      created_at: c.createdAt,
      updated_at: c.updatedAt,
      resolved_at: c.resolvedAt,
    };
  }

  async list(
    admin: AuthUser,
    q: {
      page: number;
      limit: number;
      offset: number;
      order: 'asc' | 'desc';
      status?: string;
      against_type?: string;
      assigned?: string;
    },
  ) {
    const c: SQL[] = [];
    if (q.status) c.push(eq(complaints.status, q.status as never));
    if (q.against_type)
      c.push(eq(complaints.againstType, q.against_type as never));
    if (q.assigned === 'me') c.push(eq(complaints.assignedAdminId, admin.id));
    else if (q.assigned) c.push(eq(complaints.assignedAdminId, q.assigned));
    const where = c.length ? and(...c) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(complaints)
        .where(where)
        .orderBy(
          q.order === 'asc'
            ? asc(complaints.createdAt)
            : desc(complaints.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(complaints).where(where),
    ]);
    return Paginated.of(
      rows.map((r) => this.summary(r)),
      total,
      q.page,
      q.limit,
    );
  }

  private async load(id: string) {
    const [c] = await this.db
      .select()
      .from(complaints)
      .where(eq(complaints.id, id))
      .limit(1);
    if (!c) throw new AppException('COMPLAINT_NOT_FOUND');
    return c;
  }

  async get(id: string) {
    const c = await this.load(id);
    const msgs = await this.db
      .select()
      .from(complaintMessages)
      .where(eq(complaintMessages.complaintId, id))
      .orderBy(asc(complaintMessages.createdAt));
    return {
      ...this.summary(c),
      description: c.description,
      resolution_note: c.resolutionNote,
      messages: msgs.map((m) => ({
        id: m.id,
        sender_user_id: m.senderUserId,
        body: m.body,
        file_id: m.fileId,
        is_internal: m.isInternal,
        created_at: m.createdAt,
      })),
    };
  }

  private async log(
    admin: AuthUser,
    action: string,
    id: string,
    meta: RequestMeta,
    extra: { reason?: string | null; metadata?: Record<string, unknown> } = {},
  ) {
    await this.audit.log({
      action,
      actorUserId: admin.id,
      actorRole: admin.role,
      resourceType: 'complaint',
      resourceId: id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      reason: extra.reason ?? null,
      metadata: extra.metadata,
    });
  }

  async assign(
    admin: AuthUser,
    id: string,
    assigneeId: string | undefined,
    meta: RequestMeta,
  ) {
    const c = await this.load(id);
    if (CLOSED.includes(c.status)) throw new AppException('COMPLAINT_CLOSED');
    const target = assigneeId ?? admin.id;
    const [u] = await this.db
      .select({ role: users.role, status: users.status })
      .from(users)
      .where(eq(users.id, target))
      .limit(1);
    if (
      !u ||
      !['ADMIN', 'SUPER_ADMIN'].includes(u.role) ||
      u.status !== 'ACTIVE'
    )
      throw new AppException('COMPLAINT_ASSIGNEE_INVALID');
    await this.db
      .update(complaints)
      .set({
        assignedAdminId: target,
        status: c.status === 'OPEN' ? 'IN_REVIEW' : c.status,
      })
      .where(eq(complaints.id, id));
    await this.log(admin, 'COMPLAINT_ASSIGNED', id, meta, {
      metadata: { assigned_admin_id: target },
    });
    return this.get(id);
  }

  async setStatus(
    admin: AuthUser,
    id: string,
    status: 'IN_REVIEW' | 'ESCALATED' | 'REJECTED',
    reason: string,
    meta: RequestMeta,
  ) {
    const c = await this.load(id);
    if (CLOSED.includes(c.status)) throw new AppException('COMPLAINT_CLOSED');
    await this.db
      .update(complaints)
      .set({
        status,
        ...(status === 'REJECTED'
          ? { resolutionNote: reason, resolvedAt: new Date() }
          : {}),
      })
      .where(eq(complaints.id, id));
    await this.log(admin, 'COMPLAINT_STATUS_CHANGED', id, meta, {
      reason,
      metadata: { from: c.status, to: status },
    });
    if (status === 'REJECTED') await this.notifyReporter(c);
    return this.get(id);
  }

  /** Internal note: visible to admins only. */
  async addNote(admin: AuthUser, id: string, body: string, meta: RequestMeta) {
    await this.load(id);
    await this.db.insert(complaintMessages).values({
      complaintId: id,
      senderUserId: admin.id,
      body,
      isInternal: true,
    });
    await this.log(admin, 'COMPLAINT_INTERNAL_NOTE_ADDED', id, meta);
    return this.get(id);
  }

  async resolve(
    admin: AuthUser,
    granted: Set<Permission>,
    id: string,
    dto: {
      outcome: ComplaintOutcome;
      note: string;
      refund_amount_centimes?: number;
    },
    meta: RequestMeta,
  ) {
    const c = await this.load(id);
    if (CLOSED.includes(c.status)) throw new AppException('COMPLAINT_CLOSED');
    let effect: Record<string, unknown> = {};

    if (dto.outcome === 'REFUND') {
      if (!c.orderId)
        throw new AppException('COMPLAINT_OUTCOME_INVALID', {
          reason: 'no_order',
        });
      const refund = await this.refunds.requestByAdmin(
        admin,
        c.orderId,
        {
          amount_centimes: dto.refund_amount_centimes,
          reason: `complaint ${c.reference}: ${dto.note}`,
        },
        meta,
      );
      effect = { refund_id: refund.id, refund_status: refund.status };
    }
    if (dto.outcome === 'SUSPENSION') {
      if (!granted.has(PERMISSIONS.USERS_MANAGE))
        throw new AppException('PERMISSION_DENIED', {
          required: [PERMISSIONS.USERS_MANAGE],
        });
      effect = await this.suspend(admin, c, dto.note, meta);
    }
    if (dto.outcome === 'WARNING') {
      const targets = await this.partyUserIds(c);
      if (!targets.length)
        throw new AppException('COMPLAINT_OUTCOME_INVALID', {
          reason: 'no_party',
        });
      await this.notifications.notify({
        userIds: targets,
        type: 'COMPLAINT_OUTCOME',
        params: {
          reference: c.reference,
          label_key: 'labels.complaint_outcome.WARNING',
        },
        data: { complaint_id: c.id },
      });
      effect = { warned_users: targets.length };
    }

    await this.db
      .update(complaints)
      .set({
        status: 'RESOLVED',
        resolutionNote: dto.note,
        resolutionOutcome: dto.outcome,
        resolvedAt: new Date(),
      })
      .where(eq(complaints.id, id));
    await this.log(admin, 'COMPLAINT_RESOLVED', id, meta, {
      reason: dto.note,
      metadata: { outcome: dto.outcome, ...effect },
    });
    await this.notifyReporter(c);
    return { ...(await this.get(id)), effect };
  }

  private async notifyReporter(c: ComplaintRow) {
    await this.notifications.notify({
      userIds: [c.reporterUserId],
      type: 'COMPLAINT_OUTCOME',
      params: {
        reference: c.reference,
        label_key: 'labels.complaint_outcome.CLOSED',
      },
      data: { complaint_id: c.id },
    });
  }

  /** Accounts behind the party the complaint is against. */
  private async partyUserIds(c: ComplaintRow): Promise<string[]> {
    if (!c.againstId) return [];
    if (c.againstType === 'PHARMACY') {
      const rows = await this.db
        .select({ id: pharmacyStaff.userId })
        .from(pharmacyStaff)
        .where(
          and(
            eq(pharmacyStaff.pharmacyId, c.againstId),
            inArray(pharmacyStaff.staffRole, ['OWNER', 'PHARMACIST']),
            eq(pharmacyStaff.isActive, true),
          ),
        );
      return rows.map((r) => r.id);
    }
    if (c.againstType === 'DRIVER') {
      const [d] = await this.db
        .select({ id: drivers.userId })
        .from(drivers)
        .where(eq(drivers.id, c.againstId))
        .limit(1);
      return d ? [d.id] : [];
    }
    if (c.againstType === 'PATIENT') return [c.againstId];
    return [];
  }

  private async suspend(
    admin: AuthUser,
    c: ComplaintRow,
    reason: string,
    meta: RequestMeta,
  ) {
    if (!c.againstId)
      throw new AppException('COMPLAINT_OUTCOME_INVALID', {
        reason: 'no_party',
      });
    const audit = (resourceType: string, resourceId: string) =>
      this.audit.log({
        action: 'SUSPENDED_AFTER_COMPLAINT',
        actorUserId: admin.id,
        actorRole: admin.role,
        resourceType,
        resourceId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        reason,
        metadata: { complaint_id: c.id },
      });
    if (c.againstType === 'PHARMACY') {
      const [p] = await this.db
        .update(pharmacies)
        .set({ status: 'SUSPENDED' })
        .where(eq(pharmacies.id, c.againstId))
        .returning({ id: pharmacies.id });
      if (!p)
        throw new AppException('COMPLAINT_OUTCOME_INVALID', {
          reason: 'party_not_found',
        });
      await audit('pharmacy', p.id);
      return { suspended: 'pharmacy', pharmacy_id: p.id };
    }
    if (c.againstType === 'DRIVER') {
      const [d] = await this.db
        .update(drivers)
        .set({ status: 'SUSPENDED', isAvailable: false })
        .where(eq(drivers.id, c.againstId))
        .returning();
      if (!d)
        throw new AppException('COMPLAINT_OUTCOME_INVALID', {
          reason: 'party_not_found',
        });
      await this.tokens.revokeAllForUser(d.userId, 'suspended_after_complaint');
      await audit('driver', d.id);
      return { suspended: 'driver', driver_id: d.id };
    }
    if (c.againstType === 'PATIENT') {
      const [u] = await this.db
        .update(users)
        .set({ status: 'SUSPENDED' })
        .where(and(eq(users.id, c.againstId), eq(users.role, 'PATIENT')))
        .returning({ id: users.id });
      if (!u)
        throw new AppException('COMPLAINT_OUTCOME_INVALID', {
          reason: 'party_not_found',
        });
      await this.tokens.revokeAllForUser(u.id, 'suspended_after_complaint');
      await audit('user', u.id);
      return { suspended: 'user', user_id: u.id };
    }
    throw new AppException('COMPLAINT_OUTCOME_INVALID', { reason: 'platform' });
  }
}
