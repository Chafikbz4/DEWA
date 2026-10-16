import { config } from 'dotenv';
import { runMigrations } from '../src/database/migrate';
import { runSeed } from '../src/database/seeds/seed';

export default async function globalSetup() {
  const env = config({ path: '.env.test', quiet: true }).parsed ?? {};
  const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  if (!url)
    throw new Error(
      '.env.test with DATABASE_URL(_UNPOOLED) is required for e2e tests',
    );
  if (/production/i.test(env.NEON_BRANCH ?? ''))
    throw new Error('Refusing to run e2e tests against production');
  // Make the test database authoritative for this process as well.
  config({ path: '.env.test', override: true, quiet: true });
  process.removeAllListeners('warning');
  await runMigrations(url);
  await runSeed(url);
}
