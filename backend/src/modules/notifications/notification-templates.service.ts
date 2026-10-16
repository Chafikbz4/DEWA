import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Database, DRIZZLE } from '../../database/database.module';
import { notificationTemplates } from '../../database/schema';

const REFRESH_MS = 60_000;

/**
 * Admin overrides of notification texts (notification_templates), kept in
 * memory so rendering stays synchronous. Refreshed on change and every
 * minute (other instances pick changes up within that delay).
 */
@Injectable()
export class NotificationTemplatesService implements OnModuleInit {
  private readonly logger = new Logger('NotificationTemplates');
  private map = new Map<string, { title: string; body: string }>();
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async onModuleInit() {
    await this.reload();
  }

  reload(): Promise<void> {
    this.loading ??= this.db
      .select()
      .from(notificationTemplates)
      .then((rows) => {
        this.map = new Map(
          rows.map((r) => [
            `${r.type}:${r.lang}`,
            { title: r.title, body: r.body },
          ]),
        );
        this.loadedAt = Date.now();
      })
      .catch((err: Error) => this.logger.warn(`reload failed: ${err.message}`))
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  invalidate() {
    return this.reload();
  }

  get(type: string, lang: string) {
    if (Date.now() - this.loadedAt > REFRESH_MS) void this.reload();
    return this.map.get(`${type}:${lang}`);
  }
}
