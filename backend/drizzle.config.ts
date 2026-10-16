import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: ['.env.local', '.env'], quiet: true });

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // Migrations must use the direct (non -pooler) connection.
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED! },
});
