/* Idempotent seed: safe to run repeatedly. Never overwrites admin-edited data.
 * Usage: npm run db:seed
 * Super admin is created only when SEED_SUPER_ADMIN_EMAIL and
 * SEED_SUPER_ADMIN_PASSWORD are set (never hard-coded).
 */
import { config } from 'dotenv';
import { eq, sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { hashPassword } from '../../common/crypto/password';
import * as schema from '../schema';
import * as geo from './data/algeria-geo.json';

type Db = NodePgDatabase<typeof schema>;

export const PLATFORM_SETTINGS: {
  key: string;
  value: unknown;
  description: string;
}[] = [
  {
    key: 'payment_before_validation',
    value: false,
    description:
      'If true, the patient pays before the pharmacist validates the order. Default false: pharmacist validates first.',
  },
  {
    key: 'request_expiry_hours',
    value: 24,
    description: 'Hours before an unanswered request expires.',
  },
  {
    key: 'offer_validity_hours',
    value: 12,
    description: 'Default validity of a pharmacy offer, in hours.',
  },
  {
    key: 'payment_deadline_minutes',
    value: 30,
    description: 'Minutes the patient has to pay an accepted offer.',
  },
  {
    key: 'max_pharmacies_per_request',
    value: 5,
    description: 'Maximum pharmacies a single request is sent to.',
  },
  {
    key: 'delivery_enabled',
    value: false,
    description:
      'Global switch for home delivery (off until delivery partners and legal review are in place).',
  },
  {
    key: 'sensitive_data_retention_days',
    value: 365,
    description:
      'Days prescriptions/CHIFA images are kept after the related order is closed. PLACEHOLDER – must be confirmed by legal counsel (Law 18-07).',
  },
];

/** Example policies – ALL disabled. Enabling requires a reviewed legal basis (DB-enforced). */
const ELIGIBILITY_POLICIES: (typeof schema.eligibilityPolicies.$inferInsert)[] =
  [
    {
      name: 'OTC products – example policy (pending legal review)',
      appliesToCategory: 'OTC',
      allowedOnlineRequest: true,
      allowedOnlinePayment: true,
      allowedDelivery: true,
      requiresPharmacistValidation: true,
      requiresOriginalPrescription: false,
      legalBasisReference: null,
      isEnabled: false,
    },
    {
      name: 'Prescription medicines – example policy (pending legal review)',
      appliesToCategory: 'PRESCRIPTION',
      allowedOnlineRequest: true,
      allowedOnlinePayment: false,
      allowedDelivery: false,
      requiresPharmacistValidation: true,
      requiresOriginalPrescription: true,
      legalBasisReference: null,
      isEnabled: false,
    },
    ...(['CONTROLLED', 'PSYCHOTROPIC', 'COLD_CHAIN', 'OTHER'] as const).map(
      (category) => ({
        name: `${category} – blocked by default`,
        appliesToCategory: category,
        allowedOnlineRequest: false,
        allowedOnlinePayment: false,
        allowedDelivery: false,
        requiresPharmacistValidation: true,
        requiresOriginalPrescription: true,
        legalBasisReference: null,
        isEnabled: false,
      }),
    ),
  ];

async function seedGeo(db: Db) {
  await db
    .insert(schema.wilayas)
    .values(
      geo.wilayas.map((w) => ({
        id: w.id,
        nameFr: w.name_fr,
        nameAr: w.name_ar,
      })),
    )
    .onConflictDoUpdate({
      target: schema.wilayas.id,
      set: { nameFr: sql`excluded.name_fr`, nameAr: sql`excluded.name_ar` },
    });
  const rows = geo.communes.map((c) => ({
    id: c.id,
    wilayaId: c.wilaya_id,
    nameFr: c.name_fr,
    nameAr: c.name_ar,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(schema.communes)
      .values(rows.slice(i, i + 500))
      .onConflictDoUpdate({
        target: schema.communes.id,
        set: {
          wilayaId: sql`excluded.wilaya_id`,
          nameFr: sql`excluded.name_fr`,
          nameAr: sql`excluded.name_ar`,
        },
      });
  }
  return { wilayas: geo.wilayas.length, communes: rows.length };
}

async function seedSettings(db: Db) {
  const res = await db
    .insert(schema.platformSettings)
    .values(PLATFORM_SETTINGS)
    .onConflictDoNothing()
    .returning({ key: schema.platformSettings.key });
  return res.length;
}

async function seedPolicies(db: Db) {
  let inserted = 0;
  for (const policy of ELIGIBILITY_POLICIES) {
    const existing = await db
      .select({ id: schema.eligibilityPolicies.id })
      .from(schema.eligibilityPolicies)
      .where(
        eq(
          schema.eligibilityPolicies.appliesToCategory,
          policy.appliesToCategory,
        ),
      )
      .limit(1);
    if (!existing.length) {
      await db.insert(schema.eligibilityPolicies).values(policy);
      inserted++;
    }
  }
  return inserted;
}

async function seedSuperAdmin(db: Db) {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  if (!email || !password)
    return 'skipped (SEED_SUPER_ADMIN_EMAIL / SEED_SUPER_ADMIN_PASSWORD not set)';
  if (password.length < 12)
    throw new Error('SEED_SUPER_ADMIN_PASSWORD must be at least 12 characters');

  const [existing] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (existing) return 'already exists (unchanged)';

  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(schema.users)
      .values({
        role: 'SUPER_ADMIN',
        email,
        passwordHash: await hashPassword(password),
        emailVerifiedAt: new Date(),
        // ACTIVE, but MFA enrolment is forced at first login before any token is issued.
        status: 'ACTIVE',
        preferredLanguage: 'fr',
      })
      .returning({ id: schema.users.id });
    await tx.insert(schema.staffProfiles).values({
      userId: user.id,
      firstName: process.env.SEED_SUPER_ADMIN_FIRST_NAME ?? 'Super',
      lastName: process.env.SEED_SUPER_ADMIN_LAST_NAME ?? 'Admin',
    });
    await tx.insert(schema.auditLogs).values({
      action: 'SEED_SUPER_ADMIN_CREATED',
      resourceType: 'user',
      resourceId: user.id,
      reason: 'Initial platform seed',
    });
  });
  return `created (${email}) – MFA enrolment required at first login`;
}

export async function runSeed(url: string) {
  const pool = new Pool({ connectionString: url, max: 2 });
  const db = drizzle(pool, { schema });
  try {
    const geoResult = await seedGeo(db);
    console.log(
      `✓ geo: ${geoResult.wilayas} wilayas, ${geoResult.communes} communes`,
    );
    console.log(`✓ platform_settings: ${await seedSettings(db)} new key(s)`);
    console.log(
      `✓ eligibility_policies: ${await seedPolicies(db)} new polic(ies), all disabled`,
    );
    console.log(`✓ super admin: ${await seedSuperAdmin(db)}`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  // Only the CLI entry point reads env files – importing this module (e.g. from
  // the e2e global setup) must never pull production credentials into process.env.
  config({ path: [process.env.ENV_FILE ?? '.env.local', '.env'], quiet: true });
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  runSeed(url).catch((err: unknown) => {
    console.error('✗ seed failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
