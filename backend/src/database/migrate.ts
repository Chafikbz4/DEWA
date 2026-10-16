/* Applies pending SQL migrations from ./drizzle using the DIRECT connection.
 * Usage: npm run db:migrate   (dev, via tsx)
 *        node dist/database/migrate.js   (production image)
 */
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { Client } from 'pg';

config({ path: [process.env.ENV_FILE ?? '.env.local', '.env'], quiet: true });

export async function runMigrations(url: string) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await migrate(drizzle(client), {
      migrationsFolder: resolve(process.cwd(), 'drizzle'),
    });
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_UNPOOLED (or DATABASE_URL) is required');
  runMigrations(url)
    .then(() => console.log('✓ migrations applied'))
    .catch((err: unknown) => {
      console.error('✗ migration failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
