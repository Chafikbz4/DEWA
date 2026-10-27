import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  SQL,
} from 'drizzle-orm';
import { AuthUser } from '../../common/auth/auth-user';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { I18nService, Lang } from '../../common/i18n/i18n.service';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  devices,
  notificationPreferences,
  notifications,
  users,
} from '../../database/schema';
import {
  JOB_DEAD_LETTERED_EVENT,
  JobQueueService,
} from '../jobs/job-queue.service';
import {
  EMAIL_PROVIDER,
  IEmailProvider,
  IPushProvider,
  ISmsProvider,
  PUSH_PROVIDER,
  SMS_PROVIDER,
} from '../messaging-providers/providers';
import { NotificationTemplatesService } from './notification-templates.service';

export type Channel = 'IN_APP' | 'PUSH' | 'SMS' | 'EMAIL';

/** Default channels per notification type. IN_APP is always recorded. */
export const NOTIFICATION_TYPES = {
  REQUEST_RECEIVED: ['IN_APP', 'PUSH'],
  CLARIFICATION_REQUESTED: ['IN_APP', 'PUSH', 'SMS'],
  CLARIFICATION_ANSWERED: ['IN_APP', 'PUSH'],
  OFFER_RECEIVED: ['IN_APP', 'PUSH', 'SMS'],
  OFFER_ACCEPTED: ['IN_APP', 'PUSH'],
  NEW_MESSAGE: ['IN_APP', 'PUSH'],
  REQUEST_EXPIRED: ['IN_APP', 'PUSH'],
  REQUEST_CANCELLED: ['IN_APP'],
  ORDER_STATUS_CHANGED: ['IN_APP', 'PUSH'],
  PHARMACY_ORDER_UPDATE: ['IN_APP', 'PUSH'],
  PHARMACY_ORDER_PLACED: ['IN_APP', 'PUSH'],
  DELIVERY_CODE: ['IN_APP', 'SMS'],
  PICKUP_CODE: ['IN_APP'],
  COLLECTION_CODE: ['IN_APP', 'SMS'],
  DELIVERY_JOB_AVAILABLE: ['IN_APP', 'PUSH'],
  PAYMENT_CONFIRMED: ['IN_APP', 'PUSH'],
  PAYMENT_FAILED: ['IN_APP', 'PUSH'],
  REFUND_COMPLETED: ['IN_APP', 'PUSH', 'SMS'],
  ACCOUNT_STATUS_CHANGED: ['IN_APP', 'EMAIL', 'SMS'],
  VERIFICATION_DECIDED: ['IN_APP', 'EMAIL', 'SMS'],
  ADMIN_ALERT: ['IN_APP'],
  COMPLAINT_OUTCOME: ['IN_APP', 'EMAIL'],
} as const satisfies Record<string, readonly Channel[]>;
export type NotificationType = keyof typeof NOTIFICATION_TYPES;

/** Security-relevant types that cannot be muted. */
const UNMUTABLE: NotificationType[] = [
  'DELIVERY_CODE',
  'COLLECTION_CODE',
  'PICKUP_CODE',
  'ACCOUNT_STATUS_CHANGED',
];

export const DELIVER_JOB = 'notifications.deliver';
export const NOTIFICATION_CREATED_EVENT = 'notification.created';

export interface NotifyInput {
  userIds: string[];
  type: NotificationType;
  /** Template params – references and statuses only, NEVER medicine names or medical data. */
  params?: Record<string, string | number>;
  /** Params encrypted at rest (e.g. one-time codes). */
  secretParams?: Record<string, string>;
  /** Ids for deep links (request_id, offer_id, order_id, conversation_id…). */
  data?: Record<string, string>;
}

interface StoredPayload {
  params?: Record<string, string | number>;
  secret?: string;
  data?: Record<string, string>;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly retryBaseMs: number;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PUSH_PROVIDER) private readonly push: IPushProvider,
    @Inject(SMS_PROVIDER) private readonly sms: ISmsProvider,
    @Inject(EMAIL_PROVIDER) private readonly email: IEmailProvider,
    private readonly jobs: JobQueueService,
    private readonly i18n: I18nService,
    private readonly crypto: CryptoService,
    private readonly events: EventEmitter2,
    private readonly templates: NotificationTemplatesService,
    config: ConfigService,
  ) {
    this.retryBaseMs = Number(config.get('NOTIFICATION_RETRY_BASE_MS') ?? 2000);
  }

  onModuleInit() {
    this.jobs.register(
      DELIVER_JOB,
      (p: { notificationId: string }) => this.deliver(p.notificationId),
      {
        attempts: 5,
        backoffMs: this.retryBaseMs,
      },
    );
  }

  // ----------------------------------------------------------------- create

  async notify(input: NotifyInput) {
    const userIds = [...new Set(input.userIds)].filter(Boolean);
    if (!userIds.length) return;
    const prefs = await this.db
      .select()
      .from(notificationPreferences)
      .where(inArray(notificationPreferences.userId, userIds));
    const prefByUser = new Map(prefs.map((p) => [p.userId, p]));
    const payload: StoredPayload = {
      params: input.params,
      data: input.data,
      secret: input.secretParams
        ? this.crypto.encrypt(JSON.stringify(input.secretParams))
        : undefined,
    };
    const titleKey = `notifications.${input.type}.title`;
    const bodyKey = `notifications.${input.type}.body`;

    for (const userId of userIds) {
      const pref = prefByUser.get(userId);
      const muted =
        !UNMUTABLE.includes(input.type) &&
        (pref?.mutedTypes ?? []).includes(input.type);
      const channels = (
        NOTIFICATION_TYPES[input.type] as readonly Channel[]
      ).filter((c) => {
        if (c === 'IN_APP') return true;
        if (muted) return false;
        if (c === 'PUSH') return pref?.pushEnabled ?? true;
        if (c === 'SMS') return pref?.smsEnabled ?? true;
        return pref?.emailEnabled ?? true;
      });
      const rows = await this.db
        .insert(notifications)
        .values(
          channels.map((channel) => ({
            userId,
            type: input.type,
            titleKey,
            bodyKey,
            payload,
            channel,
            status:
              channel === 'IN_APP' ? ('SENT' as const) : ('QUEUED' as const),
            sentAt: channel === 'IN_APP' ? new Date() : null,
          })),
        )
        .returning({ id: notifications.id, channel: notifications.channel });
      for (const row of rows) {
        if (row.channel === 'IN_APP') {
          this.events.emit(NOTIFICATION_CREATED_EVENT, {
            userId,
            notificationId: row.id,
            type: input.type,
          });
        } else {
          await this.jobs.enqueue(DELIVER_JOB, { notificationId: row.id });
        }
      }
    }
  }

  // ---------------------------------------------------------------- deliver

  private render(row: typeof notifications.$inferSelect, lang: Lang) {
    const payload = (row.payload ?? {}) as StoredPayload;
    const params: Record<string, string | number> = {
      ...(payload.params ?? {}),
    };
    const safeParams: Record<string, string | number> = { ...params };
    if (payload.secret)
      Object.assign(
        params,
        JSON.parse(this.crypto.decrypt(payload.secret)) as Record<
          string,
          string
        >,
      );
    if (
      typeof params.status === 'string' &&
      params.status_label === undefined
    ) {
      const key = `labels.order_status.${params.status}`;
      params.status_label = this.i18n.has(key, lang)
        ? this.i18n.t(key, lang)
        : params.status;
    }
    // Localised label passed by key (verification decisions, account status…).
    if (
      typeof params.label_key === 'string' &&
      params.status_label === undefined
    )
      params.status_label = this.i18n.t(params.label_key, lang);
    if (params.status_label !== undefined)
      safeParams.status_label = params.status_label;
    const override = this.templates.get(row.type, lang);
    const fill = (tpl: string) =>
      tpl.replace(/\{(\w+)\}/g, (m, name: string) =>
        params[name] !== undefined ? String(params[name]) : m,
      );
    return {
      title: override
        ? fill(override.title)
        : this.i18n.t(row.titleKey, lang, params),
      body: override
        ? fill(override.body)
        : this.i18n.t(row.bodyKey, lang, params),
      data: payload.data ?? {},
      params: safeParams,
    };
  }

  /** Sends one queued PUSH / SMS / EMAIL notification. Throws to trigger a retry. */
  async deliver(notificationId: string) {
    const [row] = await this.db
      .select({
        n: notifications,
        lang: users.preferredLanguage,
        phone: users.phone,
        phoneVerified: users.phoneVerifiedAt,
        email: users.email,
      })
      .from(notifications)
      .innerJoin(users, eq(users.id, notifications.userId))
      .where(eq(notifications.id, notificationId))
      .limit(1);
    if (!row || row.n.status !== 'QUEUED') return;
    const { title, body, data } = this.render(row.n, row.lang as Lang);

    const giveUp = (reason: string) =>
      this.db
        .update(notifications)
        .set({ status: 'FAILED', lastError: reason })
        .where(eq(notifications.id, notificationId));

    try {
      if (row.n.channel === 'PUSH') {
        const tokens = (
          await this.db
            .select({ token: devices.pushToken })
            .from(devices)
            .where(
              and(
                eq(devices.userId, row.n.userId),
                isNull(devices.revokedAt),
                isNotNull(devices.pushToken),
              ),
            )
        ).map((d) => d.token!);
        if (!tokens.length) return void (await giveUp('no_push_token'));
        await this.push.send(tokens, title, body, {
          ...data,
          type: row.n.type,
          notification_id: row.n.id,
        });
      } else if (row.n.channel === 'SMS') {
        if (!row.phone || !row.phoneVerified)
          return void (await giveUp('no_verified_phone'));
        await this.sms.send(row.phone, `${title} – ${body}`);
      } else if (row.n.channel === 'EMAIL') {
        if (!row.email) return void (await giveUp('no_email'));
        await this.email.send(row.email, title, body);
      }
    } catch (err) {
      await this.db
        .update(notifications)
        .set({
          attempts: row.n.attempts + 1,
          lastError: (err as Error).message.slice(0, 500),
        })
        .where(eq(notifications.id, notificationId));
      throw err;
    }
    await this.db
      .update(notifications)
      .set({
        status: 'SENT',
        sentAt: new Date(),
        attempts: row.n.attempts + 1,
        lastError: null,
      })
      .where(eq(notifications.id, notificationId));
  }

  @OnEvent(JOB_DEAD_LETTERED_EVENT)
  async onDeadLetter(e: {
    name: string;
    payload: { notificationId?: string };
  }) {
    if (e.name !== DELIVER_JOB || !e.payload?.notificationId) return;
    await this.db
      .update(notifications)
      .set({ status: 'FAILED', deadLetteredAt: new Date() })
      .where(eq(notifications.id, e.payload.notificationId));
  }

  // -------------------------------------------------------------- user API

  async list(
    user: AuthUser,
    q: {
      page: number;
      limit: number;
      offset: number;
      order: 'asc' | 'desc';
      unread?: boolean;
      type?: string;
    },
  ) {
    const conditions: SQL[] = [
      eq(notifications.userId, user.id),
      eq(notifications.channel, 'IN_APP'),
    ];
    if (q.unread) conditions.push(isNull(notifications.readAt));
    if (q.type) conditions.push(eq(notifications.type, q.type));
    const where = and(...conditions);
    const [rows, [{ total }], [{ unread }]] = await Promise.all([
      this.db
        .select()
        .from(notifications)
        .where(where)
        .orderBy(
          q.order === 'asc'
            ? notifications.createdAt
            : desc(notifications.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(notifications).where(where),
      this.db
        .select({ unread: count() })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, user.id),
            eq(notifications.channel, 'IN_APP'),
            isNull(notifications.readAt),
          ),
        ),
    ]);
    const lang = user.preferredLanguage as Lang;
    const page = Paginated.of(
      rows.map((r) => {
        const { title, body, data, params } = this.render(r, lang);
        return {
          id: r.id,
          type: r.type,
          title,
          body,
          title_key: r.titleKey,
          body_key: r.bodyKey,
          data,
          params,
          read_at: r.readAt,
          created_at: r.createdAt,
        };
      }),
      total,
      q.page,
      q.limit,
    );
    return page.withMeta({ unread_count: unread });
  }

  async markRead(user: AuthUser, id: string) {
    const res = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, user.id),
          eq(notifications.channel, 'IN_APP'),
        ),
      )
      .returning({ id: notifications.id, readAt: notifications.readAt });
    if (!res.length) throw new AppException('NOTIFICATION_NOT_FOUND');
    return { id: res[0].id, read_at: res[0].readAt };
  }

  async markAllRead(user: AuthUser) {
    const res = await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, user.id),
          eq(notifications.channel, 'IN_APP'),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });
    return { updated: res.length };
  }

  async getPreferences(user: AuthUser) {
    const [p] = await this.db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, user.id))
      .limit(1);
    return {
      push_enabled: p?.pushEnabled ?? true,
      sms_enabled: p?.smsEnabled ?? true,
      email_enabled: p?.emailEnabled ?? true,
      muted_types: p?.mutedTypes ?? [],
      available_types: Object.keys(NOTIFICATION_TYPES).filter(
        (t) => !UNMUTABLE.includes(t as NotificationType),
      ),
    };
  }

  async updatePreferences(
    user: AuthUser,
    dto: {
      push_enabled?: boolean;
      sms_enabled?: boolean;
      email_enabled?: boolean;
      muted_types?: string[];
    },
  ) {
    const current = await this.getPreferences(user);
    const muted = (dto.muted_types ?? current.muted_types).filter((t) =>
      current.available_types.includes(t),
    );
    const values = {
      userId: user.id,
      pushEnabled: dto.push_enabled ?? current.push_enabled,
      smsEnabled: dto.sms_enabled ?? current.sms_enabled,
      emailEnabled: dto.email_enabled ?? current.email_enabled,
      mutedTypes: [...new Set(muted)],
    };
    await this.db
      .insert(notificationPreferences)
      .values(values)
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: { ...values, updatedAt: new Date() },
      });
    return this.getPreferences(user);
  }
}
