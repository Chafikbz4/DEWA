import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Database, DRIZZLE } from '../database/database.module';

@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async check() {
    try {
      const { rows } = await this.db.execute<{ now: string; version: string }>(
        sql`select now() as now, version() as version`,
      );
      return { status: 'ok', database: 'up', ...rows[0] };
    } catch (err) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
        message: (err as Error).message,
      });
    }
  }
}
