import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, count, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import {
  AuthUser,
  MFA_MANDATORY_ROLES,
  MFA_OPTIONAL_ROLES,
} from '../../../common/auth/auth-user';
import { RequestMeta } from '../../../common/auth/decorators';
import {
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
} from '../../../common/crypto/password';
import { AppException } from '../../../common/errors/app.exception';
import { Paginated } from '../../../common/http/envelope';
import { PaginationQueryDto } from '../../../common/http/pagination.dto';
import { Lang } from '../../../common/i18n/i18n.service';
import {
  maskIdentifier,
  NormalizedIdentifier,
  normalizeIdentifier,
  normalizePhone,
} from '../../../common/utils/identifier';
import { Database, DbOrTx, DRIZZLE } from '../../../database/database.module';
import { devices, sessions, users } from '../../../database/schema';
import { AuditAction, AuditService } from '../../audit/audit.service';
import type {
  LoginResponseDto,
  OtpSentDto,
  OtpVerifyResponseDto,
  SessionDto,
} from '../dto/auth.dto';
import { OtpPurposeInput } from '../dto/auth.dto';
import { MfaService } from './mfa.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

export type UserRow = typeof users.$inferSelect;

export const toUserSummary = (
  u: Pick<UserRow, 'id' | 'role' | 'status' | 'preferredLanguage'>,
) => ({
  id: u.id,
  role: u.role,
  status: u.status,
  preferred_language: u.preferredLanguage,
});

@Injectable()
export class AuthService {
  private readonly maxFailed: number;
  private readonly lockoutMinutes: number;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.maxFailed = config.get<number>('LOGIN_MAX_FAILED_ATTEMPTS', 5);
    this.lockoutMinutes = config.get<number>('LOGIN_LOCKOUT_MINUTES', 15);
  }

  // ------------------------------------------------------------ lookups

  async findByIdentifier(id: NormalizedIdentifier, tx: DbOrTx = this.db) {
    const [user] = await tx
      .select()
      .from(users)
      .where(
        and(
          id.type === 'EMAIL'
            ? eq(users.email, id.value)
            : eq(users.phone, id.value),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);
    return user;
  }

  async findById(id: string, tx: DbOrTx = this.db) {
    const [user] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);
    return user;
  }

  private isIdentifierVerified(user: UserRow, id: NormalizedIdentifier) {
    return id.type === 'EMAIL'
      ? !!user.emailVerifiedAt
      : !!user.phoneVerifiedAt;
  }

  // ------------------------------------------------------------ login

  async login(
    identifier: string,
    password: string,
    meta: RequestMeta,
  ): Promise<LoginResponseDto> {
    const id = normalizeIdentifier(identifier);
    const user = id ? await this.findByIdentifier(id) : undefined;

    if (!user) {
      await verifyAgainstDummy(password);
      await this.audit.log({
        action: AuditAction.AUTH_LOGIN_FAILED,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: {
          reason: 'unknown_identifier',
          identifier: id ? maskIdentifier(id) : 'invalid',
        },
      });
      throw new AppException('AUTH_INVALID_CREDENTIALS');
    }

    const passwordOk = await verifyPassword(user.passwordHash, password);

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      // Only reveal the lock to someone who knows the password.
      if (passwordOk) {
        throw new AppException('AUTH_ACCOUNT_LOCKED', null, {
          minutes: Math.ceil(
            (user.lockedUntil.getTime() - Date.now()) / 60_000,
          ),
        });
      }
      throw new AppException('AUTH_INVALID_CREDENTIALS');
    }

    if (!passwordOk) {
      await this.registerFailure(user, meta, 'bad_password');
      throw new AppException('AUTH_INVALID_CREDENTIALS');
    }

    this.assertCanLogin(user);
    return this.completeLogin(user, meta);
  }

  async loginWithOtp(
    phone: string,
    code: string,
    meta: RequestMeta,
  ): Promise<LoginResponseDto> {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new AppException('OTP_INVALID');
    const userId = await this.otp.verify(normalized, 'LOGIN', code);
    const user = await this.findById(userId);
    if (!user) throw new AppException('OTP_INVALID');
    this.assertCanLogin(user);
    return this.completeLogin(user, meta);
  }

  async loginWithMfa(
    mfaToken: string,
    code: string,
    meta: RequestMeta,
  ): Promise<LoginResponseDto> {
    const { userId, setup } = await this.tokens.verifyMfaToken(mfaToken);
    if (setup) throw new AppException('MFA_SETUP_NOT_STARTED');
    const user = await this.findById(userId);
    if (!user || !user.mfaEnabled) throw new AppException('MFA_TOKEN_INVALID');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppException('AUTH_ACCOUNT_LOCKED', null, {
        minutes: Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000),
      });
    }
    if (!this.mfa.verify(user.mfaSecretEncrypted, code)) {
      await this.registerFailure(user, meta, 'bad_mfa_code');
      throw new AppException('MFA_INVALID_CODE');
    }
    this.assertCanLogin(user);
    return this.completeLogin(user, meta, { mfaPassed: true });
  }

  private assertCanLogin(user: UserRow) {
    if (user.status === 'SUSPENDED')
      throw new AppException('ACCOUNT_SUSPENDED');
    if (user.status === 'DELETED')
      throw new AppException('AUTH_INVALID_CREDENTIALS');
  }

  /** Increments the failure counter atomically; locks the account at the threshold. */
  private async registerFailure(
    user: UserRow,
    meta: RequestMeta,
    reason: string,
  ) {
    const [row] = await this.db
      .update(users)
      .set({ failedLoginCount: sql`${users.failedLoginCount} + 1` })
      .where(eq(users.id, user.id))
      .returning({ failed: users.failedLoginCount });

    await this.audit.log({
      action:
        reason === 'bad_mfa_code'
          ? AuditAction.AUTH_MFA_FAILED
          : AuditAction.AUTH_LOGIN_FAILED,
      actorUserId: user.id,
      actorRole: user.role,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reason, failed_count: row.failed },
    });

    if (row.failed >= this.maxFailed) {
      const lockedUntil = new Date(Date.now() + this.lockoutMinutes * 60_000);
      await this.db
        .update(users)
        .set({ lockedUntil, failedLoginCount: 0 })
        .where(eq(users.id, user.id));
      await this.audit.log({
        action: AuditAction.AUTH_ACCOUNT_LOCKED,
        actorUserId: user.id,
        actorRole: user.role,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { locked_until: lockedUntil.toISOString() },
      });
    }
  }

  /** Issues a session, while preserving opt-in MFA for supported roles. */
  async completeLogin(
    user: UserRow,
    meta: RequestMeta,
    opts: { mfaPassed?: boolean; tx?: DbOrTx } = {},
  ): Promise<LoginResponseDto> {
    const mfaNeeded =
      MFA_MANDATORY_ROLES.includes(user.role) ||
      (MFA_OPTIONAL_ROLES.includes(user.role) && user.mfaEnabled);
    if (mfaNeeded && !opts.mfaPassed) {
      return {
        mfa_required: true,
        mfa_setup_required: !user.mfaEnabled,
        mfa_token: await this.tokens.signMfaToken(user.id, !user.mfaEnabled),
      };
    }

    const tx = opts.tx ?? this.db;
    const { tokens, sessionId } = await this.tokens.issue(user, meta, {}, tx);
    await tx
      .update(users)
      .set({ lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
    await this.audit.log(
      {
        action: AuditAction.AUTH_LOGIN_SUCCESS,
        actorUserId: user.id,
        actorRole: user.role,
        resourceType: 'session',
        resourceId: sessionId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { mfa: !!opts.mfaPassed },
      },
      opts.tx,
    );
    return { ...tokens, user: toUserSummary(user) };
  }

  // ------------------------------------------------------------ refresh

  async refresh(
    refreshToken: string,
    deviceIdentifier: string | undefined,
    meta: RequestMeta,
  ): Promise<LoginResponseDto> {
    const parsed = this.tokens.parseRefreshToken(refreshToken);
    if (!parsed) throw new AppException('AUTH_REFRESH_INVALID');

    const [session] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, parsed.sessionId))
      .limit(1);
    if (!session) throw new AppException('AUTH_REFRESH_INVALID');
    // Wrong secret for a real session id: reject without side effects.
    if (!this.tokens.secretMatches(parsed.secret, session.refreshTokenHash)) {
      throw new AppException('AUTH_REFRESH_INVALID');
    }

    if (session.revokedAt) {
      if (session.replacedBySessionId) {
        // A rotated (already used) token came back → token theft. Kill the family.
        const revoked = await this.tokens.revokeFamily(
          session.familyId,
          'refresh_reuse_detected',
        );
        await this.audit.log({
          action: AuditAction.AUTH_REFRESH_REUSE_DETECTED,
          actorUserId: session.userId,
          resourceType: 'session_family',
          resourceId: session.familyId,
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: {
            reused_session_id: session.id,
            sessions_revoked: revoked,
          },
        });
        throw new AppException('AUTH_REFRESH_REUSED');
      }
      throw new AppException('AUTH_REFRESH_INVALID');
    }
    if (session.expiresAt < new Date())
      throw new AppException('AUTH_REFRESH_INVALID');

    if (session.deviceId) {
      const [device] = await this.db
        .select({
          identifier: devices.deviceIdentifier,
          revokedAt: devices.revokedAt,
        })
        .from(devices)
        .where(eq(devices.id, session.deviceId))
        .limit(1);
      if (
        !device ||
        device.revokedAt ||
        device.identifier !== deviceIdentifier
      ) {
        throw new AppException('AUTH_DEVICE_MISMATCH');
      }
    }

    const user = await this.findById(session.userId);
    if (!user || user.status === 'SUSPENDED' || user.status === 'DELETED') {
      await this.tokens.revokeFamily(session.familyId, 'account_unavailable');
      throw new AppException(
        user?.status === 'SUSPENDED'
          ? 'ACCOUNT_SUSPENDED'
          : 'AUTH_REFRESH_INVALID',
      );
    }

    return this.db.transaction(async (tx) => {
      const { tokens, sessionId } = await this.tokens.issue(
        user,
        meta,
        { familyId: session.familyId, deviceId: session.deviceId },
        tx,
      );
      // Conditional update: a concurrent refresh with the same token loses.
      const rotated = await tx
        .update(sessions)
        .set({
          revokedAt: new Date(),
          revokeReason: 'rotated',
          replacedBySessionId: sessionId,
        })
        .where(and(eq(sessions.id, session.id), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id });
      if (!rotated.length) throw new AppException('AUTH_REFRESH_INVALID');
      if (session.deviceId) {
        await tx
          .update(devices)
          .set({ lastSeenAt: new Date() })
          .where(eq(devices.id, session.deviceId));
      }
      return { ...tokens, user: toUserSummary(user) };
    });
  }

  // ------------------------------------------------------------ sessions

  async logout(user: AuthUser, meta: RequestMeta) {
    await this.tokens.revokeSession(user.sessionId, 'logout');
    await this.audit.log({
      action: AuditAction.AUTH_LOGOUT,
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'session',
      resourceId: user.sessionId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { ok: true };
  }

  async logoutAll(user: AuthUser, meta: RequestMeta) {
    const revoked = await this.tokens.revokeAllForUser(user.id, 'logout_all');
    await this.audit.log({
      action: AuditAction.AUTH_LOGOUT_ALL,
      actorUserId: user.id,
      actorRole: user.role,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { sessions_revoked: revoked },
    });
    return { ok: true, sessions_revoked: revoked };
  }

  async listSessions(
    user: AuthUser,
    q: PaginationQueryDto & { sort?: 'created_at' | 'last_used_at' },
  ) {
    const where = and(
      eq(sessions.userId, user.id),
      isNull(sessions.revokedAt),
      gt(sessions.expiresAt, new Date()),
    );
    const sortCol =
      q.sort === 'last_used_at' ? sessions.lastUsedAt : sessions.createdAt;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: sessions.id,
          ip: sessions.ip,
          userAgent: sessions.userAgent,
          deviceId: sessions.deviceId,
          platform: devices.platform,
          createdAt: sessions.createdAt,
          lastUsedAt: sessions.lastUsedAt,
          expiresAt: sessions.expiresAt,
        })
        .from(sessions)
        .leftJoin(devices, eq(devices.id, sessions.deviceId))
        .where(where)
        .orderBy(q.order === 'asc' ? sortCol : desc(sortCol))
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(sessions).where(where),
    ]);
    const items: SessionDto[] = rows.map((r) => ({
      id: r.id,
      current: r.id === user.sessionId,
      ip: r.ip,
      user_agent: r.userAgent,
      device_id: r.deviceId,
      device_platform: r.platform,
      created_at: r.createdAt,
      last_used_at: r.lastUsedAt,
      expires_at: r.expiresAt,
    }));
    return Paginated.of(items, total, q.page, q.limit);
  }

  async revokeOwnSession(user: AuthUser, sessionId: string, meta: RequestMeta) {
    const revoked = await this.tokens.revokeSession(
      sessionId,
      'revoked_by_user',
    );
    if (!revoked) throw new AppException('AUTH_SESSION_NOT_FOUND');
    await this.audit.log({
      action: AuditAction.AUTH_SESSION_REVOKED,
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'session',
      resourceId: sessionId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { ok: true };
  }

  // ------------------------------------------------------------ OTP endpoints

  async requestOtp(
    target: string,
    purpose: OtpPurposeInput,
    lang: Lang,
    currentUser?: AuthUser,
  ): Promise<OtpSentDto> {
    const id = normalizeIdentifier(target);
    if (!id) throw new AppException('VALIDATION_FAILED');
    const user = await this.findByIdentifier(id);
    const userLang = (user?.preferredLanguage as Lang) ?? lang;
    let userId: string | null = null;
    let notifyAccountExists = false;

    switch (purpose) {
      case 'REGISTER':
        if (
          user &&
          user.status === 'PENDING_VERIFICATION' &&
          !this.isIdentifierVerified(user, id)
        ) {
          userId = user.id;
        } else if (user) {
          notifyAccountExists = true;
        }
        break;
      case 'LOGIN':
        if (id.type !== 'PHONE')
          throw new AppException('OTP_PURPOSE_NOT_ALLOWED');
        if (user && user.phoneVerifiedAt && user.status !== 'SUSPENDED')
          userId = user.id;
        break;
      case 'RESET_PASSWORD':
        if (
          user &&
          this.isIdentifierVerified(user, id) &&
          user.status !== 'SUSPENDED'
        )
          userId = user.id;
        break;
      case 'VERIFY_PHONE':
      case 'VERIFY_EMAIL': {
        const expectedType = purpose === 'VERIFY_PHONE' ? 'PHONE' : 'EMAIL';
        if (!currentUser || id.type !== expectedType)
          throw new AppException('OTP_PURPOSE_NOT_ALLOWED');
        if (!user || user.id !== currentUser.id)
          throw new AppException('RESOURCE_FORBIDDEN');
        userId = user.id;
        break;
      }
    }

    const { expiresIn } = await this.otp.issue({
      target: id,
      purpose,
      userId,
      lang: userLang,
      notifyAccountExists,
    });
    return {
      otp_sent: true,
      target_masked: maskIdentifier(id),
      expires_in: expiresIn,
    };
  }

  async verifyOtp(
    target: string,
    purpose: OtpPurposeInput,
    code: string,
    meta: RequestMeta,
    currentUser?: AuthUser,
  ): Promise<OtpVerifyResponseDto> {
    if (purpose === 'LOGIN') throw new AppException('OTP_PURPOSE_NOT_ALLOWED');
    if (
      (purpose === 'VERIFY_PHONE' || purpose === 'VERIFY_EMAIL') &&
      !currentUser
    ) {
      throw new AppException('OTP_PURPOSE_NOT_ALLOWED');
    }
    const id = normalizeIdentifier(target);
    if (!id) throw new AppException('OTP_INVALID');

    const userId = await this.otp.verify(id.value, purpose, code);
    const user = await this.findById(userId);
    if (!user) throw new AppException('OTP_INVALID');

    if (purpose === 'RESET_PASSWORD') {
      return {
        reset_token: await this.tokens.signResetToken(
          user.id,
          user.passwordChangedAt,
        ),
      };
    }

    if (
      (purpose === 'VERIFY_PHONE' || purpose === 'VERIFY_EMAIL') &&
      currentUser?.id !== user.id
    ) {
      throw new AppException('OTP_INVALID');
    }

    // REGISTER / VERIFY_*: mark the identifier verified.
    const verifiedField =
      id.type === 'EMAIL'
        ? { emailVerifiedAt: new Date() }
        : { phoneVerifiedAt: new Date() };
    // Patients and pharmacy owners self-activate after proving ownership of
    // their identifier. Other roles remain pending admin review.
    const activate =
      (user.role === 'PATIENT' || user.role === 'PHARMACY_OWNER') &&
      user.status === 'PENDING_VERIFICATION';
    const [updated] = await this.db
      .update(users)
      .set({
        ...verifiedField,
        ...(activate ? { status: 'ACTIVE' as const } : {}),
      })
      .where(eq(users.id, user.id))
      .returning();
    await this.audit.log({
      action: AuditAction.AUTH_IDENTIFIER_VERIFIED,
      actorUserId: user.id,
      actorRole: user.role,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { channel: id.type, purpose, activated: activate },
    });

    if (purpose === 'REGISTER') {
      this.assertCanLogin(updated);
      return this.completeLogin(updated, meta);
    }
    return { verified: true };
  }

  // ------------------------------------------------------------ passwords

  async forgotPassword(identifier: string, lang: Lang): Promise<OtpSentDto> {
    const id = normalizeIdentifier(identifier);
    if (!id) throw new AppException('VALIDATION_FAILED');
    return this.requestOtp(identifier, 'RESET_PASSWORD', lang);
  }

  async resetPassword(
    resetToken: string,
    newPassword: string,
    meta: RequestMeta,
  ) {
    const { userId, pwv } = await this.tokens.verifyResetToken(resetToken);
    const user = await this.findById(userId);
    // Single use: the token embeds the password version it was issued for.
    if (!user || (user.passwordChangedAt?.getTime() ?? 0) !== pwv) {
      throw new AppException('OTP_INVALID');
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash: await hashPassword(newPassword),
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        })
        .where(eq(users.id, user.id));
      await this.tokens.revokeAllForUser(user.id, 'password_reset', {}, tx);
      await this.audit.log(
        {
          action: AuditAction.AUTH_PASSWORD_RESET,
          actorUserId: user.id,
          actorRole: user.role,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
        tx,
      );
    });
    return { ok: true };
  }

  async changePassword(
    current: AuthUser,
    currentPassword: string,
    newPassword: string,
    meta: RequestMeta,
  ) {
    const user = await this.findById(current.id);
    if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
      throw new AppException('AUTH_PASSWORD_INCORRECT');
    }
    if (await verifyPassword(user.passwordHash, newPassword)) {
      throw new AppException('AUTH_PASSWORD_REUSED');
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          passwordHash: await hashPassword(newPassword),
          passwordChangedAt: new Date(),
        })
        .where(eq(users.id, user.id));
      // Keep the current session, sign out everywhere else.
      await this.tokens.revokeAllForUser(
        user.id,
        'password_changed',
        { exceptSessionId: current.sessionId },
        tx,
      );
      await this.audit.log(
        {
          action: AuditAction.AUTH_PASSWORD_CHANGED,
          actorUserId: user.id,
          actorRole: user.role,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
        tx,
      );
    });
    return { ok: true };
  }

  // ------------------------------------------------------------ MFA

  /** Resolves who is configuring MFA: Bearer user, or the mfa_token of the login flow. */
  async resolveMfaPrincipal(
    current: AuthUser | undefined,
    mfaToken: string | undefined,
  ) {
    if (current)
      return { user: await this.findById(current.id), viaLoginFlow: false };
    if (!mfaToken) throw new AppException('AUTH_TOKEN_MISSING');
    const { userId } = await this.tokens.verifyMfaToken(mfaToken);
    return { user: await this.findById(userId), viaLoginFlow: true };
  }

  async mfaSetup(user: UserRow | undefined) {
    if (!user) throw new AppException('MFA_TOKEN_INVALID');
    this.assertMfaAvailable(user);
    if (user.mfaEnabled) throw new AppException('MFA_ALREADY_ENABLED');
    const { secret, encrypted, otpauthUrl } = this.mfa.createSecret(
      user.email ?? user.phone ?? user.id,
    );
    await this.db
      .update(users)
      .set({ mfaSecretEncrypted: encrypted })
      .where(eq(users.id, user.id));
    return { secret, otpauth_url: otpauthUrl };
  }

  async mfaEnable(
    user: UserRow | undefined,
    code: string,
    viaLoginFlow: boolean,
    meta: RequestMeta,
  ) {
    if (!user) throw new AppException('MFA_TOKEN_INVALID');
    this.assertMfaAvailable(user);
    if (user.mfaEnabled) throw new AppException('MFA_ALREADY_ENABLED');
    if (!user.mfaSecretEncrypted)
      throw new AppException('MFA_SETUP_NOT_STARTED');
    if (!this.mfa.verify(user.mfaSecretEncrypted, code)) {
      await this.registerFailure(user, meta, 'bad_mfa_code');
      throw new AppException('MFA_INVALID_CODE');
    }
    // Admin accounts created by a super admin become ACTIVE once MFA is enrolled.
    const activateAdmin =
      user.role === 'ADMIN' && user.status === 'PENDING_VERIFICATION';
    const [updated] = await this.db
      .update(users)
      .set({
        mfaEnabled: true,
        ...(activateAdmin ? { status: 'ACTIVE' as const } : {}),
      })
      .where(eq(users.id, user.id))
      .returning();
    await this.audit.log({
      action: AuditAction.AUTH_MFA_ENABLED,
      actorUserId: user.id,
      actorRole: user.role,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { admin_activated: activateAdmin },
    });
    if (viaLoginFlow) {
      this.assertCanLogin(updated);
      return this.completeLogin(updated, meta, { mfaPassed: true });
    }
    return { mfa_enabled: true };
  }

  async mfaDisable(
    current: AuthUser,
    code: string,
    password: string,
    meta: RequestMeta,
  ) {
    const user = await this.findById(current.id);
    if (!user) throw new AppException('USER_NOT_FOUND');
    if (MFA_MANDATORY_ROLES.includes(user.role))
      throw new AppException('MFA_MANDATORY_FOR_ROLE');
    if (!user.mfaEnabled) throw new AppException('MFA_NOT_ENABLED');
    if (!(await verifyPassword(user.passwordHash, password)))
      throw new AppException('AUTH_PASSWORD_INCORRECT');
    if (!this.mfa.verify(user.mfaSecretEncrypted, code))
      throw new AppException('MFA_INVALID_CODE');
    await this.db
      .update(users)
      .set({ mfaEnabled: false, mfaSecretEncrypted: null })
      .where(eq(users.id, user.id));
    await this.audit.log({
      action: AuditAction.AUTH_MFA_DISABLED,
      actorUserId: user.id,
      actorRole: user.role,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { mfa_enabled: false };
  }

  private assertMfaAvailable(user: UserRow) {
    if (
      !MFA_MANDATORY_ROLES.includes(user.role) &&
      !MFA_OPTIONAL_ROLES.includes(user.role)
    ) {
      throw new AppException('MFA_NOT_AVAILABLE_FOR_ROLE');
    }
  }
}
