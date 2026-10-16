import { Inject, Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { Database, DRIZZLE } from '../../database/database.module';
import { platformSettings } from '../../database/schema';
import {
  SETTING_DEFAULTS,
  SettingKey,
  SettingValue,
} from './settings.defaults';

const TTL_MS = 15_000;

/** Reads platform_settings with a short cache; falls back to code defaults. */
@Injectable()
export class SettingsService {
  private cache = new Map<string, { value: unknown; at: number }>();

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS)
      return hit.value as SettingValue<K>;
    const [row] = await this.db
      .select({ value: platformSettings.value })
      .from(platformSettings)
      .where(inArray(platformSettings.key, [key]))
      .limit(1);
    const value = (row?.value ??
      SETTING_DEFAULTS[key].value) as SettingValue<K>;
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  invalidate(key?: string) {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }
}
