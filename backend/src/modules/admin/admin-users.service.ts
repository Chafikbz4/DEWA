import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, ilike, isNull, or, SQL } from 'drizzle-orm';
import { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { hashPassword } from '../../common/crypto/password';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { normalizeEmail, normalizePhone } from '../../common/utils/identifier';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  adminUserRoles,
  patientProfiles,
  staffProfiles,
  users,
} from '../../database/schema';
import { AuditAction, AuditService } from '../audit/audit.service';
import { TokenService } from '../auth/services/token.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AdminUserDto,
  AdminUsersQueryDto,
  CreateAdminDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/admin-users.dto';

type UserRow = typeof users.$inferSelect;

const present = (u: UserRow): AdminUserDto => ({
  id: u.id,
  role: u.role,
  status: u.status,
  email: u.email,
  phone: u.phone,
  email_verified: !!u.emailVerifiedAt,
  phone_verified: !!u.phoneVerifiedAt,
  mfa_enabled: u.mfaEnabled,
  last_login_at: u.lastLoginAt,
  created_at: u.createdAt,
});

@Injectable()
export class AdminUsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
    private readonly notifications: NotificationsService,
  ) {}

  /** SUPER_ADMIN only. Admins start PENDING_VERIFICATION and activate on MFA enrolment. */
  async createAdmin(actor: AuthUser, dto: CreateAdminDto, meta: RequestMeta) {
    const email = normalizeEmail(dto.email);
    const phone = dto.phone ? normalizePhone(dto.phone) : null;
    const clash = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          isNull(users.deletedAt),
          phone
            ? or(eq(users.email, email), eq(users.phone, phone))
            : eq(users.email, email),
        ),
      )
      .limit(1);
    if (clash.length) throw new AppException('IDENTIFIER_ALREADY_USED');

    const passwordHash = await hashPassword(dto.password);
    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          role: 'ADMIN',
          email,
          phone,
          passwordHash,
          preferredLanguage: dto.preferred_language,
          status: 'PENDING_VERIFICATION',
        })
        .returning();
      await tx.insert(staffProfiles).values({
        userId: user.id,
        firstName: dto.first_name,
        lastName: dto.last_name,
      });
      await this.audit.log(
        {
          action: AuditAction.ADMIN_USER_CREATED,
          actorUserId: actor.id,
          actorRole: actor.role,
          resourceType: 'user',
          resourceId: user.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
          reason: dto.reason,
          metadata: { role: 'ADMIN' },
        },
        tx,
      );
      return present(user);
    });
  }

  async list(actor: AuthUser, q: AdminUsersQueryDto, meta: RequestMeta) {
    const conditions: SQL[] = [isNull(users.deletedAt)];
    if (q.role) conditions.push(eq(users.role, q.role));
    if (q.status) conditions.push(eq(users.status, q.status));
    if (q.search) {
      const term = `${q.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      conditions.push(
        or(ilike(users.email, term), ilike(users.phone, term)) as SQL,
      );
    }
    const where = and(...conditions);
    const sortCol =
      q.sort === 'last_login_at' ? users.lastLoginAt : users.createdAt;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(where)
        .orderBy(q.order === 'asc' ? sortCol : desc(sortCol))
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(users).where(where),
    ]);
    // Listing users exposes personal data → audited admin action.
    await this.audit.log({
      action: AuditAction.ADMIN_USERS_LISTED,
      actorUserId: actor.id,
      actorRole: actor.role,
      resourceType: 'user',
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: {
        role: q.role,
        status: q.status,
        search: q.search ? 'yes' : 'no',
        page: q.page,
        results: rows.length,
      },
    });
    return Paginated.of(rows.map(present), total, q.page, q.limit);
  }

  /** Account data only (names, contact, status) – never health data. Audited. */
  async get(actor: AuthUser, userId: string, meta: RequestMeta) {
    const [u] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!u) throw new AppException('USER_NOT_FOUND');
    const [staff] = await this.db
      .select({ first: staffProfiles.firstName, last: staffProfiles.lastName })
      .from(staffProfiles)
      .where(eq(staffProfiles.userId, userId));
    const [patient] = await this.db
      .select({
        first: patientProfiles.firstName,
        last: patientProfiles.lastName,
      })
      .from(patientProfiles)
      .where(eq(patientProfiles.userId, userId));
    const adminRoles =
      u.role === 'ADMIN'
        ? (
            await this.db
              .select({ r: adminUserRoles.adminRole })
              .from(adminUserRoles)
              .where(eq(adminUserRoles.userId, userId))
          ).map((x) => x.r)
        : [];
    await this.audit.log({
      action: AuditAction.ADMIN_USER_VIEWED,
      actorUserId: actor.id,
      actorRole: actor.role,
      resourceType: 'user',
      resourceId: userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    const name = staff ?? patient;
    return {
      ...present(u),
      first_name: name?.first ?? null,
      last_name: name?.last ?? null,
      preferred_language: u.preferredLanguage,
      admin_roles: adminRoles,
    };
  }

  private async loadTarget(actor: AuthUser, userId: string) {
    if (actor.id === userId) throw new AppException('CANNOT_MODIFY_SELF');
    const [target] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!target) throw new AppException('USER_NOT_FOUND');
    // Super admins cannot be modified through the API; admins cannot modify admins.
    if (target.role === 'SUPER_ADMIN') throw new AppException('ROLE_FORBIDDEN');
    if (target.role === 'ADMIN' && actor.role !== 'SUPER_ADMIN')
      throw new AppException('ROLE_FORBIDDEN');
    return target;
  }

  async updateStatus(
    actor: AuthUser,
    userId: string,
    dto: UpdateUserStatusDto,
    meta: RequestMeta,
  ) {
    const target = await this.loadTarget(actor, userId);
    const result = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(users)
        .set({ status: dto.status })
        .where(eq(users.id, userId))
        .returning();
      if (dto.status === 'SUSPENDED') {
        await this.tokens.revokeAllForUser(
          userId,
          'suspended_by_admin',
          {},
          tx,
        );
      }
      await this.audit.log(
        {
          action: AuditAction.USER_STATUS_CHANGED,
          actorUserId: actor.id,
          actorRole: actor.role,
          resourceType: 'user',
          resourceId: userId,
          ip: meta.ip,
          userAgent: meta.userAgent,
          reason: dto.reason,
          metadata: { from: target.status, to: dto.status },
        },
        tx,
      );
      return present(updated);
    });
    if (target.status !== dto.status)
      await this.notifications.notify({
        userIds: [userId],
        type: 'ACCOUNT_STATUS_CHANGED',
        params: { label_key: `labels.account_status.${dto.status}` },
      });
    return result;
  }

  /** SUPER_ADMIN only. Forces re-login so the new role applies everywhere. */
  async updateRole(
    actor: AuthUser,
    userId: string,
    dto: UpdateUserRoleDto,
    meta: RequestMeta,
  ) {
    const target = await this.loadTarget(actor, userId);
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(users)
        .set({ role: dto.role })
        .where(eq(users.id, userId))
        .returning();
      await this.tokens.revokeAllForUser(userId, 'role_changed', {}, tx);
      await this.audit.log(
        {
          action: AuditAction.USER_ROLE_CHANGED,
          actorUserId: actor.id,
          actorRole: actor.role,
          resourceType: 'user',
          resourceId: userId,
          ip: meta.ip,
          userAgent: meta.userAgent,
          reason: dto.reason,
          metadata: { from: target.role, to: dto.role },
        },
        tx,
      );
      return present(updated);
    });
  }
}
