import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, isNull, SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { Paginated } from '../../common/http/envelope';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  commissionRules,
  communes,
  deliveryFeeRules,
  deliveryZones,
  eligibilityPolicies,
  pharmacies,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { SettingKey } from '../settings/settings.defaults';
import { SettingsService } from '../settings/settings.service';
import { AdminSettingsService } from './admin-settings.service';

/** Delivery settings an admin with delivery_config.manage may change (delivery_enabled stays SUPER_ADMIN only). */
export const DELIVERY_SETTING_KEYS: SettingKey[] = [
  'delivery_assignment_timeout_minutes',
  'delivery_max_releases_per_day',
  'driver_location_min_interval_seconds',
  'delivery_code_max_attempts',
];

/** Categories that can never be enabled without a documented legal basis. */
const CONTROLLED_CATEGORIES = ['CONTROLLED', 'PSYCHOTROPIC'];

type Zone = typeof deliveryZones.$inferSelect;
type FeeRule = typeof deliveryFeeRules.$inferSelect;
type Commission = typeof commissionRules.$inferSelect;
type Policy = typeof eligibilityPolicies.$inferSelect;

const presentZone = (z: Zone) => ({
  id: z.id,
  wilaya_id: z.wilayaId,
  commune_id: z.communeId,
  is_active: z.isActive,
  created_at: z.createdAt,
});
const presentFee = (r: FeeRule) => ({
  id: r.id,
  zone_id: r.zoneId,
  base_fee_centimes: r.baseFeeCentimes,
  per_km_centimes: r.perKmCentimes,
  min_fee_centimes: r.minFeeCentimes,
  max_fee_centimes: r.maxFeeCentimes,
  effective_from: r.effectiveFrom,
  is_active: r.isActive,
  created_at: r.createdAt,
});
const presentCommission = (c: Commission) => ({
  id: c.id,
  scope: c.scope,
  pharmacy_id: c.pharmacyId,
  type: c.type,
  value: c.value,
  is_active: c.isActive,
  legal_review_note: c.legalReviewNote,
  created_at: c.createdAt,
  updated_at: c.updatedAt,
});
const presentPolicy = (p: Policy) => ({
  id: p.id,
  name: p.name,
  applies_to_category: p.appliesToCategory,
  is_enabled: p.isEnabled,
  allowed_online_request: p.allowedOnlineRequest,
  allowed_online_payment: p.allowedOnlinePayment,
  allowed_delivery: p.allowedDelivery,
  requires_pharmacist_validation: p.requiresPharmacistValidation,
  requires_original_prescription: p.requiresOriginalPrescription,
  legal_basis_reference: p.legalBasisReference,
  reviewed_by: p.reviewedBy,
  reviewed_at: p.reviewedAt,
  updated_at: p.updatedAt,
});

/**
 * Admin configuration: delivery zones / fee rules / timeouts, commission &
 * subscription rules, eligibility policies. Every change is audited with its
 * before/after values and applies immediately.
 */
@Injectable()
export class AdminConfigService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly adminSettings: AdminSettingsService,
  ) {}

  private log(
    admin: AuthUser,
    action: string,
    resourceType: string,
    resourceId: string,
    meta: RequestMeta,
    metadata?: Record<string, unknown>,
    reason?: string,
  ) {
    return this.audit.log({
      action,
      actorUserId: admin.id,
      actorRole: admin.role,
      resourceType,
      resourceId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata,
      reason: reason ?? null,
    });
  }

  // ------------------------------------------------------------- zones

  async listZones(q: {
    page: number;
    limit: number;
    offset: number;
    wilaya_id?: number;
    active?: boolean;
  }) {
    const c: SQL[] = [];
    if (q.wilaya_id) c.push(eq(deliveryZones.wilayaId, q.wilaya_id));
    if (q.active !== undefined) c.push(eq(deliveryZones.isActive, q.active));
    const where = c.length ? and(...c) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(deliveryZones)
        .where(where)
        .orderBy(asc(deliveryZones.wilayaId), asc(deliveryZones.communeId))
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(deliveryZones).where(where),
    ]);
    return Paginated.of(rows.map(presentZone), total, q.page, q.limit);
  }

  async createZone(
    admin: AuthUser,
    dto: { wilaya_id: number; commune_id?: number | null },
    meta: RequestMeta,
  ) {
    if (dto.commune_id) {
      const [c] = await this.db
        .select({ w: communes.wilayaId })
        .from(communes)
        .where(eq(communes.id, dto.commune_id))
        .limit(1);
      if (!c || c.w !== dto.wilaya_id)
        throw new AppException('GEO_INVALID_COMMUNE');
    }
    const [dup] = await this.db
      .select({ id: deliveryZones.id })
      .from(deliveryZones)
      .where(
        and(
          eq(deliveryZones.wilayaId, dto.wilaya_id),
          dto.commune_id
            ? eq(deliveryZones.communeId, dto.commune_id)
            : isNull(deliveryZones.communeId),
          eq(deliveryZones.isActive, true),
        ),
      )
      .limit(1);
    if (dup) throw new AppException('DELIVERY_ZONE_EXISTS');
    const [z] = await this.db
      .insert(deliveryZones)
      .values({ wilayaId: dto.wilaya_id, communeId: dto.commune_id ?? null })
      .returning();
    await this.log(
      admin,
      'DELIVERY_ZONE_CREATED',
      'delivery_zone',
      z.id,
      meta,
      presentZone(z),
    );
    return presentZone(z);
  }

  async updateZone(
    admin: AuthUser,
    id: string,
    dto: { is_active: boolean },
    meta: RequestMeta,
  ) {
    const [z] = await this.db
      .update(deliveryZones)
      .set({ isActive: dto.is_active })
      .where(eq(deliveryZones.id, id))
      .returning();
    if (!z) throw new AppException('NOT_FOUND');
    await this.log(admin, 'DELIVERY_ZONE_UPDATED', 'delivery_zone', id, meta, {
      is_active: dto.is_active,
    });
    return presentZone(z);
  }

  // ---------------------------------------------------------- fee rules

  async listFeeRules(q: {
    page: number;
    limit: number;
    offset: number;
    zone_id?: string;
  }) {
    const where = q.zone_id
      ? eq(deliveryFeeRules.zoneId, q.zone_id)
      : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(deliveryFeeRules)
        .where(where)
        .orderBy(desc(deliveryFeeRules.effectiveFrom))
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(deliveryFeeRules).where(where),
    ]);
    return Paginated.of(rows.map(presentFee), total, q.page, q.limit);
  }

  private checkFee(v: {
    min_fee_centimes?: number | null;
    max_fee_centimes?: number | null;
  }) {
    if (
      v.min_fee_centimes != null &&
      v.max_fee_centimes != null &&
      v.max_fee_centimes < v.min_fee_centimes
    )
      throw new AppException('VALIDATION_FAILED', {
        max_fee_centimes: 'must be >= min_fee_centimes',
      });
  }

  async createFeeRule(
    admin: AuthUser,
    dto: {
      zone_id: string;
      base_fee_centimes: number;
      per_km_centimes?: number;
      min_fee_centimes?: number | null;
      max_fee_centimes?: number | null;
      effective_from?: string;
    },
    meta: RequestMeta,
  ) {
    this.checkFee(dto);
    const [z] = await this.db
      .select({ id: deliveryZones.id })
      .from(deliveryZones)
      .where(eq(deliveryZones.id, dto.zone_id))
      .limit(1);
    if (!z) throw new AppException('NOT_FOUND');
    const [r] = await this.db
      .insert(deliveryFeeRules)
      .values({
        zoneId: dto.zone_id,
        baseFeeCentimes: dto.base_fee_centimes,
        perKmCentimes: dto.per_km_centimes ?? 0,
        minFeeCentimes: dto.min_fee_centimes ?? null,
        maxFeeCentimes: dto.max_fee_centimes ?? null,
        effectiveFrom: dto.effective_from
          ? new Date(dto.effective_from)
          : new Date(),
      })
      .returning();
    await this.log(
      admin,
      'DELIVERY_FEE_RULE_CREATED',
      'delivery_fee_rule',
      r.id,
      meta,
      presentFee(r),
    );
    return presentFee(r);
  }

  async updateFeeRule(
    admin: AuthUser,
    id: string,
    dto: {
      base_fee_centimes?: number;
      per_km_centimes?: number;
      min_fee_centimes?: number | null;
      max_fee_centimes?: number | null;
      is_active?: boolean;
    },
    meta: RequestMeta,
  ) {
    const [before] = await this.db
      .select()
      .from(deliveryFeeRules)
      .where(eq(deliveryFeeRules.id, id))
      .limit(1);
    if (!before) throw new AppException('NOT_FOUND');
    const next = {
      min_fee_centimes:
        dto.min_fee_centimes !== undefined
          ? dto.min_fee_centimes
          : before.minFeeCentimes,
      max_fee_centimes:
        dto.max_fee_centimes !== undefined
          ? dto.max_fee_centimes
          : before.maxFeeCentimes,
    };
    this.checkFee(next);
    const [r] = await this.db
      .update(deliveryFeeRules)
      .set({
        ...(dto.base_fee_centimes !== undefined
          ? { baseFeeCentimes: dto.base_fee_centimes }
          : {}),
        ...(dto.per_km_centimes !== undefined
          ? { perKmCentimes: dto.per_km_centimes }
          : {}),
        minFeeCentimes: next.min_fee_centimes,
        maxFeeCentimes: next.max_fee_centimes,
        ...(dto.is_active !== undefined ? { isActive: dto.is_active } : {}),
      })
      .where(eq(deliveryFeeRules.id, id))
      .returning();
    await this.log(
      admin,
      'DELIVERY_FEE_RULE_UPDATED',
      'delivery_fee_rule',
      id,
      meta,
      { before: presentFee(before), after: presentFee(r) },
    );
    return presentFee(r);
  }

  // ---------------------------------------------------- delivery settings

  async deliverySettings() {
    const all = await this.adminSettings.list();
    return all.filter((s) => DELIVERY_SETTING_KEYS.includes(s.key));
  }

  async updateDeliverySettings(
    admin: AuthUser,
    values: Partial<Record<SettingKey, number>>,
    reason: string,
    meta: RequestMeta,
  ) {
    const keys = Object.keys(values) as SettingKey[];
    const invalid = keys.filter((k) => !DELIVERY_SETTING_KEYS.includes(k));
    if (!keys.length || invalid.length)
      throw new AppException('SETTING_NOT_FOUND', {
        allowed: DELIVERY_SETTING_KEYS,
        invalid,
      });
    for (const k of keys)
      await this.adminSettings.update(admin, k, values[k], reason, meta);
    return this.deliverySettings();
  }

  // --------------------------------------------------- commission rules

  async listCommission(q: {
    page: number;
    limit: number;
    offset: number;
    pharmacy_id?: string;
    active?: boolean;
  }) {
    const c: SQL[] = [];
    if (q.pharmacy_id) c.push(eq(commissionRules.pharmacyId, q.pharmacy_id));
    if (q.active !== undefined) c.push(eq(commissionRules.isActive, q.active));
    const where = c.length ? and(...c) : undefined;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(commissionRules)
        .where(where)
        .orderBy(desc(commissionRules.createdAt))
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(commissionRules).where(where),
    ]);
    return Paginated.of(rows.map(presentCommission), total, q.page, q.limit);
  }

  /** New rules are always created DISABLED; activation is a separate, audited step. */
  async createCommission(
    admin: AuthUser,
    dto: {
      scope: 'GLOBAL' | 'PHARMACY';
      pharmacy_id?: string;
      type: 'PERCENT' | 'FIXED' | 'SUBSCRIPTION';
      value: number;
      legal_review_note: string;
    },
    meta: RequestMeta,
  ) {
    if ((dto.scope === 'PHARMACY') !== !!dto.pharmacy_id)
      throw new AppException('VALIDATION_FAILED', {
        pharmacy_id: 'required for scope PHARMACY only',
      });
    if (dto.type === 'PERCENT' && dto.value > 10_000)
      throw new AppException('VALIDATION_FAILED', {
        value: 'basis points ≤ 10000',
      });
    if (dto.pharmacy_id) {
      const [p] = await this.db
        .select({ id: pharmacies.id })
        .from(pharmacies)
        .where(eq(pharmacies.id, dto.pharmacy_id))
        .limit(1);
      if (!p) throw new AppException('PHARMACY_NOT_FOUND');
    }
    const [r] = await this.db
      .insert(commissionRules)
      .values({
        scope: dto.scope,
        pharmacyId: dto.pharmacy_id ?? null,
        type: dto.type,
        value: dto.value,
        legalReviewNote: dto.legal_review_note,
        isActive: false,
      })
      .returning();
    await this.log(
      admin,
      'COMMISSION_RULE_CREATED',
      'commission_rule',
      r.id,
      meta,
      presentCommission(r),
    );
    return presentCommission(r);
  }

  async updateCommission(
    admin: AuthUser,
    id: string,
    dto: {
      value?: number;
      is_active?: boolean;
      legal_review_note?: string;
      reason: string;
    },
    meta: RequestMeta,
  ) {
    const [before] = await this.db
      .select()
      .from(commissionRules)
      .where(eq(commissionRules.id, id))
      .limit(1);
    if (!before) throw new AppException('NOT_FOUND');
    const note = dto.legal_review_note ?? before.legalReviewNote;
    if (dto.is_active && !note?.trim())
      throw new AppException('LEGAL_REVIEW_NOTE_REQUIRED');
    if (
      dto.value !== undefined &&
      before.type === 'PERCENT' &&
      dto.value > 10_000
    )
      throw new AppException('VALIDATION_FAILED', {
        value: 'basis points ≤ 10000',
      });
    const [r] = await this.db.transaction(async (tx) => {
      // One active rule per scope target: activating a rule deactivates its siblings.
      if (dto.is_active)
        await tx
          .update(commissionRules)
          .set({ isActive: false })
          .where(
            and(
              eq(commissionRules.scope, before.scope),
              before.pharmacyId
                ? eq(commissionRules.pharmacyId, before.pharmacyId)
                : isNull(commissionRules.pharmacyId),
              eq(commissionRules.isActive, true),
            ),
          );
      return tx
        .update(commissionRules)
        .set({
          ...(dto.value !== undefined ? { value: dto.value } : {}),
          ...(dto.is_active !== undefined ? { isActive: dto.is_active } : {}),
          legalReviewNote: note,
        })
        .where(eq(commissionRules.id, id))
        .returning();
    });
    await this.log(
      admin,
      'COMMISSION_RULE_UPDATED',
      'commission_rule',
      id,
      meta,
      { before: presentCommission(before), after: presentCommission(r) },
      dto.reason,
    );
    return presentCommission(r);
  }

  // --------------------------------------------------- eligibility policies

  async listPolicies() {
    const rows = await this.db
      .select()
      .from(eligibilityPolicies)
      .orderBy(asc(eligibilityPolicies.appliesToCategory));
    return rows.map(presentPolicy);
  }

  /**
   * Changes take effect immediately (policies are read uncached on every
   * request). Enabling a policy requires a legal basis reference – always
   * enforced for CONTROLLED / PSYCHOTROPIC categories.
   */
  async updatePolicy(
    admin: AuthUser,
    id: string,
    dto: Partial<{
      is_enabled: boolean;
      allowed_online_request: boolean;
      allowed_online_payment: boolean;
      allowed_delivery: boolean;
      requires_pharmacist_validation: boolean;
      requires_original_prescription: boolean;
      legal_basis_reference: string | null;
    }> & { reason: string },
    meta: RequestMeta,
  ) {
    const [before] = await this.db
      .select()
      .from(eligibilityPolicies)
      .where(eq(eligibilityPolicies.id, id))
      .limit(1);
    if (!before) throw new AppException('NOT_FOUND');
    const enabled = dto.is_enabled ?? before.isEnabled;
    const legal =
      dto.legal_basis_reference !== undefined
        ? dto.legal_basis_reference
        : before.legalBasisReference;
    if (enabled && !legal?.trim())
      throw new AppException('ELIGIBILITY_LEGAL_BASIS_REQUIRED', {
        category: before.appliesToCategory,
        controlled: CONTROLLED_CATEGORIES.includes(before.appliesToCategory),
      });
    // Safety floor: restricted categories always require pharmacist validation.
    if (
      CONTROLLED_CATEGORIES.includes(before.appliesToCategory) &&
      dto.requires_pharmacist_validation === false
    )
      throw new AppException('ELIGIBILITY_RULE_FORBIDDEN', {
        requires_pharmacist_validation: true,
      });
    const [r] = await this.db
      .update(eligibilityPolicies)
      .set({
        ...(dto.is_enabled !== undefined ? { isEnabled: dto.is_enabled } : {}),
        ...(dto.allowed_online_request !== undefined
          ? { allowedOnlineRequest: dto.allowed_online_request }
          : {}),
        ...(dto.allowed_online_payment !== undefined
          ? { allowedOnlinePayment: dto.allowed_online_payment }
          : {}),
        ...(dto.allowed_delivery !== undefined
          ? { allowedDelivery: dto.allowed_delivery }
          : {}),
        ...(dto.requires_pharmacist_validation !== undefined
          ? { requiresPharmacistValidation: dto.requires_pharmacist_validation }
          : {}),
        ...(dto.requires_original_prescription !== undefined
          ? { requiresOriginalPrescription: dto.requires_original_prescription }
          : {}),
        legalBasisReference: legal,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
      })
      .where(eq(eligibilityPolicies.id, id))
      .returning();
    await this.log(
      admin,
      'ELIGIBILITY_POLICY_CHANGED',
      'eligibility_policy',
      id,
      meta,
      { before: presentPolicy(before), after: presentPolicy(r) },
      dto.reason,
    );
    this.settings.invalidate();
    return presentPolicy(r);
  }
}
