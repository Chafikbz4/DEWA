import {
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const PG_POOL = Symbol('PG_POOL');
export const DRIZZLE = Symbol('DRIZZLE');

export type Database = NodePgDatabase<typeof schema>;

@Injectable()
class PoolShutdown implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      // Long-running server: one shared pg Pool over Neon's pooled (-pooler) URL.
      useFactory: (config: ConfigService) =>
        new Pool({
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
          max: 10,
        }),
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
    PoolShutdown,
  ],
  exports: [PG_POOL, DRIZZLE],
})
export class DatabaseModule {}
