import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { I18nService, Lang } from '../../common/i18n/i18n.service';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  notificationTemplates,
  platformSettingChanges,
  platformSettings,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import {
  NOTIFICATION_TYPES,
  NotificationType,
} from '../notifications/notifications.service';
import { NotificationTemplatesService } from '../notifications/notification-templates.service';
import { SETTING_DEFAULTS, SettingKey } from '../settings/settings.defaults';
import { SettingsService } from '../settings/settings.service';

/** Allowed values for string settings with a closed set. */
const ENUM_SETTINGS: Partial<Record<SettingKey, string[]>> = {
  payment_collection_model: ['MARKETPLACE', 'PER_PHARMACY_MERCHANT'],
};

const placeholders = (s: string) =>
  new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

/**
 * Platform settings with a typed PATCH and an append-only change history,
 * and notification template overrides (per type and language) validated
 * against the default template's placeholders.
 */
@Injectable()
export class AdminSettingsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly settings: SettingsService,
    private readonly templates: NotificationTemplatesService,
    private readonly i18n: I18nService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ settings

  async list() {
    const rows = await this.db.select().from(platformSettings);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return (Object.keys(SETTING_DEFAULTS) as SettingKey[]).map((key) => {
      const row = byKey.get(key);
      return {
        key,
        value: row?.value ?? SETTING_DEFAULTS[key].value,
        default_value: SETTING_DEFAULTS[key].value,
        description: SETTING_DEFAULTS[key].description,
        allowed_values: ENUM_SETTINGS[key] ?? null,
        updated_by: row?.updatedBy ?? null,
        updated_at: row?.updatedAt ?? null,
      };
    });
  }

  private validate(key: string, value: unknown): asserts key is SettingKey {
    if (!(key in SETTING_DEFAULTS)) throw new AppException('SETTING_NOT_FOUND');
    const def = SETTING_DEFAULTS[key as SettingKey].value as unknown;
    const ok = Array.isArray(def)
      ? Array.isArray(value) &&
        value.every((v) => typeof v === 'string' && v.length <= 100) &&
        value.length <= 500
      : typeof value === typeof def &&
        (typeof value !== 'number' || (Number.isFinite(value) && value >= 0));
    const allowed = ENUM_SETTINGS[key as SettingKey];
    if (!ok || (allowed && !allowed.includes(value as string)))
      throw new AppException('SETTING_VALUE_INVALID', {
        key,
        expected: Array.isArray(def) ? 'string[]' : typeof def,
        allowed_values: allowed ?? undefined,
      });
  }

  async update(
    admin: AuthUser,
    key: string,
    value: unknown,
    reason: string,
    meta: RequestMeta,
  ) {
    this.validate(key, value);
    const [current] = await this.db
      .select()
      .from(platformSettings)
      .where(eq(platformSettings.key, key))
      .limit(1);
    const oldValue = current?.value ?? SETTING_DEFAULTS[key].value;
    await this.db.transaction(async (tx) => {
      await tx
        .insert(platformSettings)
        .values({
          key,
          value: value as object,
          description: SETTING_DEFAULTS[key].description,
          updatedBy: admin.id,
        })
        .onConflictDoUpdate({
          target: platformSettings.key,
          set: {
            value: value as object,
            updatedBy: admin.id,
            updatedAt: new Date(),
          },
        });
      await tx.insert(platformSettingChanges).values({
        key,
        oldValue: oldValue as object,
        newValue: value as object,
        changedBy: admin.id,
        reason,
      });
      await this.audit.log(
        {
          action: 'PLATFORM_SETTING_CHANGED',
          actorUserId: admin.id,
          actorRole: admin.role,
          resourceType: 'platform_setting',
          resourceId: key,
          ip: meta.ip,
          userAgent: meta.userAgent,
          reason,
          metadata: { from: oldValue, to: value },
        },
        tx,
      );
    });
    this.settings.invalidate(key);
    return (await this.list()).find((s) => s.key === key)!;
  }

  async history(
    key: string,
    q: { page: number; limit: number; offset: number },
  ) {
    if (!(key in SETTING_DEFAULTS)) throw new AppException('SETTING_NOT_FOUND');
    const where = eq(platformSettingChanges.key, key);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(platformSettingChanges)
        .where(where)
        .orderBy(desc(platformSettingChanges.createdAt))
        .limit(q.limit)
        .offset(q.offset),
      this.db
        .select({ total: count() })
        .from(platformSettingChanges)
        .where(where),
    ]);
    return Paginated.of(
      rows.map((r) => ({
        id: r.id,
        key: r.key,
        old_value: r.oldValue,
        new_value: r.newValue,
        changed_by: r.changedBy,
        reason: r.reason,
        created_at: r.createdAt,
      })),
      total,
      q.page,
      q.limit,
    );
  }

  // ----------------------------------------------------------- templates

  async listTemplates() {
    const overrides = await this.db.select().from(notificationTemplates);
    const types = Object.keys(NOTIFICATION_TYPES) as NotificationType[];
    return types.flatMap((type) =>
      (['fr', 'ar'] as Lang[]).map((lang) => {
        const o = overrides.find((x) => x.type === type && x.lang === lang);
        return {
          type,
          lang,
          channels: NOTIFICATION_TYPES[type],
          default_title: this.i18n.t(`notifications.${type}.title`, lang),
          default_body: this.i18n.t(`notifications.${type}.body`, lang),
          title: o?.title ?? null,
          body: o?.body ?? null,
          overridden: !!o,
          updated_by: o?.updatedBy ?? null,
          updated_at: o?.updatedAt ?? null,
        };
      }),
    );
  }

  /**
   * Overrides one template. Only the placeholders of the default template may
   * be used – templates can never pull in data the notification does not carry
   * (in particular no medicine names).
   */
  async putTemplate(
    admin: AuthUser,
    type: string,
    lang: Lang,
    dto: { title: string; body: string; reason: string },
    meta: RequestMeta,
  ) {
    if (!(type in NOTIFICATION_TYPES))
      throw new AppException('NOTIFICATION_TEMPLATE_NOT_FOUND');
    const allowed = new Set([
      ...placeholders(this.i18n.t(`notifications.${type}.title`, lang)),
      ...placeholders(this.i18n.t(`notifications.${type}.body`, lang)),
    ]);
    const used = [...placeholders(dto.title), ...placeholders(dto.body)];
    const unknown = used.filter((p) => !allowed.has(p));
    if (unknown.length)
      throw new AppException('NOTIFICATION_TEMPLATE_INVALID', {
        unknown_placeholders: unknown,
        allowed: [...allowed],
      });
    await this.db
      .insert(notificationTemplates)
      .values({
        type,
        lang,
        title: dto.title,
        body: dto.body,
        updatedBy: admin.id,
      })
      .onConflictDoUpdate({
        target: [notificationTemplates.type, notificationTemplates.lang],
        set: {
          title: dto.title,
          body: dto.body,
          updatedBy: admin.id,
          updatedAt: new Date(),
        },
      });
    await this.audit.log({
      action: 'NOTIFICATION_TEMPLATE_CHANGED',
      actorUserId: admin.id,
      actorRole: admin.role,
      resourceType: 'notification_template',
      resourceId: `${type}:${lang}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
      reason: dto.reason,
    });
    this.templates.invalidate();
    return (await this.listTemplates()).find(
      (t) => t.type === type && t.lang === lang,
    )!;
  }

  async resetTemplate(
    admin: AuthUser,
    type: string,
    lang: Lang,
    meta: RequestMeta,
  ) {
    const deleted = await this.db
      .delete(notificationTemplates)
      .where(
        and(
          eq(notificationTemplates.type, type),
          eq(notificationTemplates.lang, lang),
        ),
      )
      .returning();
    if (!deleted.length)
      throw new AppException('NOTIFICATION_TEMPLATE_NOT_FOUND');
    await this.audit.log({
      action: 'NOTIFICATION_TEMPLATE_RESET',
      actorUserId: admin.id,
      actorRole: admin.role,
      resourceType: 'notification_template',
      resourceId: `${type}:${lang}`,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    this.templates.invalidate();
    return (await this.listTemplates()).find(
      (t) => t.type === type && t.lang === lang,
    )!;
  }
}
