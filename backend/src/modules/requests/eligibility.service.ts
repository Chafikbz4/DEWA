import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { AppException } from '../../common/errors/app.exception';
import { Database, DRIZZLE } from '../../database/database.module';
import { eligibilityPolicies, medicines } from '../../database/schema';
import { SettingsService } from '../settings/settings.service';

export type MedicineCategory = (typeof medicines.$inferSelect)['category'];
export type Policy = typeof eligibilityPolicies.$inferSelect;

/**
 * Applies eligibility_policies. A category is allowed online only if an
 * ENABLED policy exists for it with the needed flag. Missing policy = denied
 * (CONTROLLED / PSYCHOTROPIC / COLD_CHAIN stay blocked until reviewed).
 */
@Injectable()
export class EligibilityService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly settings: SettingsService,
  ) {}

  async enabledPolicies(
    categories: MedicineCategory[],
  ): Promise<Map<MedicineCategory, Policy>> {
    if (!categories.length) return new Map();
    const rows = await this.db
      .select()
      .from(eligibilityPolicies)
      .where(
        and(
          inArray(eligibilityPolicies.appliesToCategory, categories),
          eq(eligibilityPolicies.isEnabled, true),
        ),
      );
    return new Map(rows.map((p) => [p.appliesToCategory, p]));
  }

  async categoriesOf(
    medicineIds: string[],
  ): Promise<Map<string, MedicineCategory>> {
    if (!medicineIds.length) return new Map();
    const rows = await this.db
      .select({
        id: medicines.id,
        category: medicines.category,
        active: medicines.isActive,
      })
      .from(medicines)
      .where(inArray(medicines.id, [...new Set(medicineIds)]));
    const map = new Map(
      rows.filter((r) => r.active).map((r) => [r.id, r.category]),
    );
    const unknown = medicineIds.filter((id) => !map.has(id));
    if (unknown.length) {
      throw new AppException('VALIDATION_FAILED', [
        {
          field: 'items.medicine_id',
          errors: [{ rule: 'isUUID', message_key: 'validation.isUUID' }],
          ids: unknown,
        },
      ]);
    }
    return map;
  }

  /**
   * Throws REQUEST_CATEGORY_RESTRICTED / REQUEST_DELIVERY_NOT_ALLOWED.
   * Prescription-based requests always need the PRESCRIPTION category allowed.
   */
  async assertRequestAllowed(input: {
    requestType: 'PRESCRIPTION' | 'CHIFA' | 'PRODUCT';
    medicineIds: string[];
    deliveryWanted: boolean;
  }) {
    const categories = new Set<MedicineCategory>(
      (await this.categoriesOf(input.medicineIds)).values(),
    );
    if (input.requestType !== 'PRODUCT') categories.add('PRESCRIPTION');
    const policies = await this.enabledPolicies([...categories]);

    const restricted = [...categories].filter(
      (c) => !policies.get(c)?.allowedOnlineRequest,
    );
    if (restricted.length)
      throw new AppException('REQUEST_CATEGORY_RESTRICTED', {
        categories: restricted,
      });

    if (input.deliveryWanted) {
      if (!(await this.settings.get('delivery_enabled'))) {
        throw new AppException('REQUEST_DELIVERY_NOT_ALLOWED', {
          reason: 'delivery_disabled',
        });
      }
      const noDelivery = [...categories].filter(
        (c) => !policies.get(c)!.allowedDelivery,
      );
      if (noDelivery.length) {
        throw new AppException('REQUEST_DELIVERY_NOT_ALLOWED', {
          reason: 'category_policy',
          categories: noDelivery,
        });
      }
    }
    return policies;
  }
}
