import { config } from 'dotenv';

// e2e tests run ONLY against the Neon branch configured in .env.test.
// override: true → values from .env.test win over anything already in process.env.
const parsed = config({
  path: '.env.test',
  override: true,
  quiet: true,
}).parsed;
if (!parsed?.DATABASE_URL)
  throw new Error('.env.test with DATABASE_URL is required for e2e tests');
process.env.ENV_FILE = '.env.test';
process.env.NODE_ENV = 'test';
