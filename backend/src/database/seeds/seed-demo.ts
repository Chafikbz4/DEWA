/* DEMO data for a local / staging database – NEVER for production.
 * Creates: a super admin and one admin per sub-role, two verified pharmacies
 * in Alger-Centre (24/7) with owner + pharmacist, a verified driver and a
 * verified delivery company, a demo patient with an address, a few medicines,
 * a delivery zone + fee rule, and enables the PRESCRIPTION / OTC policies with
 * an explicit "DEMO ONLY" legal basis.
 *
 * Usage:  DEMO_SEED_ALLOW=1 ENV_FILE=.env.staging npm run db:seed:demo
 * Refuses to run when NODE_ENV=production or DEMO_SEED_ALLOW is not 1.
 * All accounts share DEMO_PASSWORD (generated and printed when unset).
 * Idempotent: existing demo accounts (e-mails *@demo.dewa.dz) are reused.
 */
import { config } from 'dotenv';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { hashPassword } from '../../common/crypto/password';
import * as schema from '../schema';

config({ path: [process.env.ENV_FILE ?? '.env.local', '.env'], quiet: true });

type Db = NodePgDatabase<typeof schema>;
const DEMO_BASIS =
  'DEMO ONLY – not a legal basis. Must be replaced after legal review.';
const WILAYA = 16; // Alger

async function user(
  db: Db,
  role: schema.Role,
  email: string,
  hash: string,
  first: string,
  last: string,
) {
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  if (existing) return existing;
  const [u] = await db
    .insert(schema.users)
    .values({
      role,
      email,
      emailVerifiedAt: new Date(),
      passwordHash: hash,
      status: 'ACTIVE',
      preferredLanguage: 'fr',
    })
    .returning();
  if (role === 'PATIENT')
    await db
      .insert(schema.patientProfiles)
      .values({ userId: u.id, firstName: first, lastName: last });
  else
    await db
      .insert(schema.staffProfiles)
      .values({ userId: u.id, firstName: first, lastName: last });
  return u;
}

async function main() {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.DEMO_SEED_ALLOW !== '1'
  )
    throw new Error(
      'Refusing to seed demo data: set DEMO_SEED_ALLOW=1 and never run this against production.',
    );
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const host = new URL(url).hostname;
  console.log(`Seeding DEMO data into ${host} …`);
  const pool = new Pool({ connectionString: url, max: 2 });
  const db = drizzle(pool, { schema });
  const password =
    process.env.DEMO_PASSWORD ??
    `Demo-${randomBytes(6).toString('base64url')}9a`;
  const hash = await hashPassword(password);

  try {
    // Admins (MFA enrolment happens at their first login).
    await user(db, 'SUPER_ADMIN', 'super@demo.dewa.dz', hash, 'Super', 'Admin');
    for (const [role, email] of [
      ['VERIFICATION_ADMIN', 'verification@demo.dewa.dz'],
      ['SUPPORT_ADMIN', 'support@demo.dewa.dz'],
      ['FINANCE_ADMIN', 'finance@demo.dewa.dz'],
      ['COMPLIANCE_ADMIN', 'compliance@demo.dewa.dz'],
    ] as const) {
      const a = await user(
        db,
        'ADMIN',
        email,
        hash,
        role.split('_')[0],
        'Admin',
      );
      await db
        .insert(schema.adminUserRoles)
        .values({ userId: a.id, adminRole: role })
        .onConflictDoNothing();
    }

    // Two pharmacies in the first commune of Alger.
    const [commune] = await db
      .select()
      .from(schema.communes)
      .where(eq(schema.communes.wilayaId, WILAYA))
      .limit(1);
    const pharmacyIds: string[] = [];
    for (const [i, name] of [
      'Pharmacie Didouche',
      'Pharmacie Audin',
    ].entries()) {
      const owner = await user(
        db,
        'PHARMACY_OWNER',
        `owner${i + 1}@demo.dewa.dz`,
        hash,
        'Karima',
        `Owner${i + 1}`,
      );
      const pharmacist = await user(
        db,
        'PHARMACIST',
        `pharmacist${i + 1}@demo.dewa.dz`,
        hash,
        'Yacine',
        `Pharma${i + 1}`,
      );
      let [p] = await db
        .select()
        .from(schema.pharmacies)
        .where(eq(schema.pharmacies.authorizationNumber, `DEMO-AUTH-${i + 1}`))
        .limit(1);
      if (!p) {
        [p] = await db
          .insert(schema.pharmacies)
          .values({
            nameFr: name,
            nameAr: i === 0 ? 'صيدلية ديدوش' : 'صيدلية أودان',
            legalName: `${name} (démo)`,
            authorizationNumber: `DEMO-AUTH-${i + 1}`,
            wilayaId: WILAYA,
            communeId: commune.id,
            addressLine: `${10 + i} Rue Didouche Mourad`,
            latitude: 36.7538 + i * 0.003,
            longitude: 3.0588 + i * 0.003,
            phone: `+21321000${100 + i}`,
            status: 'VERIFIED',
            verifiedAt: new Date(),
            acceptsRequests: true,
            deliveryAvailable: true,
          })
          .returning();
        await db.insert(schema.pharmacyStaff).values([
          { pharmacyId: p.id, userId: owner.id, staffRole: 'OWNER' },
          { pharmacyId: p.id, userId: pharmacist.id, staffRole: 'PHARMACIST' },
        ]);
        await db.insert(schema.pharmacyServiceAreas).values({
          pharmacyId: p.id,
          wilayaId: WILAYA,
          communeId: commune.id,
        });
        await db.insert(schema.pharmacyOpeningHours).values(
          [0, 1, 2, 3, 4, 5, 6].map((d) => ({
            pharmacyId: p.id,
            dayOfWeek: d,
            is24h: true,
          })),
        );
      }
      pharmacyIds.push(p.id);
    }

    // Patient with a default address.
    const patient = await user(
      db,
      'PATIENT',
      'patient@demo.dewa.dz',
      hash,
      'Amel',
      'Patient',
    );
    const [addr] = await db
      .select()
      .from(schema.addresses)
      .where(eq(schema.addresses.userId, patient.id))
      .limit(1);
    if (!addr)
      await db.insert(schema.addresses).values({
        userId: patient.id,
        label: 'Maison',
        wilayaId: WILAYA,
        communeId: commune.id,
        streetLine: '5 Rue Larbi Ben Mhidi',
        latitude: 36.7552,
        longitude: 3.0601,
        isDefault: true,
      });

    // Delivery: company, independent driver, zone + fee rule.
    const companyAdmin = await user(
      db,
      'DELIVERY_COMPANY_ADMIN',
      'company@demo.dewa.dz',
      hash,
      'Samir',
      'Express',
    );
    const [company] = await db
      .select()
      .from(schema.deliveryCompanies)
      .where(eq(schema.deliveryCompanies.adminUserId, companyAdmin.id))
      .limit(1);
    if (!company)
      await db.insert(schema.deliveryCompanies).values({
        name: 'Express Démo',
        adminUserId: companyAdmin.id,
        status: 'VERIFIED',
        verifiedAt: new Date(),
      });
    const driverUser = await user(
      db,
      'DRIVER',
      'driver@demo.dewa.dz',
      hash,
      'Nadir',
      'Livreur',
    );
    await db
      .insert(schema.drivers)
      .values({
        userId: driverUser.id,
        firstName: 'Nadir',
        lastName: 'Livreur',
        vehicleType: 'MOTORCYCLE',
        status: 'VERIFIED',
        isAvailable: true,
        currentLatitude: 36.754,
        currentLongitude: 3.059,
        lastLocationAt: new Date(),
      })
      .onConflictDoNothing();
    let [zone] = await db
      .select()
      .from(schema.deliveryZones)
      .where(
        and(
          eq(schema.deliveryZones.wilayaId, WILAYA),
          eq(schema.deliveryZones.communeId, commune.id),
        ),
      )
      .limit(1);
    if (!zone) {
      [zone] = await db
        .insert(schema.deliveryZones)
        .values({ wilayaId: WILAYA, communeId: commune.id })
        .returning();
      await db.insert(schema.deliveryFeeRules).values({
        zoneId: zone.id,
        baseFeeCentimes: 20000,
        perKmCentimes: 5000,
        minFeeCentimes: 25000,
        maxFeeCentimes: 80000,
      });
    }

    // Catalogue sample.
    await db
      .insert(schema.medicines)
      .values([
        {
          brandName: 'Doliprane 1000 mg',
          innDci: 'Paracétamol',
          form: 'comprimé',
          dosage: '1000 mg',
          category: 'OTC',
          requiresPrescription: false,
          regulatoryCode: 'DEMO-0001',
        },
        {
          brandName: 'Augmentin 1 g',
          innDci: 'Amoxicilline/acide clavulanique',
          form: 'comprimé',
          dosage: '1 g',
          category: 'PRESCRIPTION',
          regulatoryCode: 'DEMO-0002',
        },
        {
          brandName: 'Ventoline 100 µg',
          innDci: 'Salbutamol',
          form: 'suspension pour inhalation',
          dosage: '100 µg',
          category: 'PRESCRIPTION',
          regulatoryCode: 'DEMO-0003',
        },
      ])
      .onConflictDoNothing();

    // Demo-only policies + switches.
    const [reviewer] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'super@demo.dewa.dz'));
    await db
      .update(schema.eligibilityPolicies)
      .set({
        isEnabled: true,
        allowedOnlineRequest: true,
        allowedOnlinePayment: true,
        allowedDelivery: true,
        legalBasisReference: DEMO_BASIS,
        reviewedBy: reviewer.id,
        reviewedAt: new Date(),
      })
      .where(
        inArray(schema.eligibilityPolicies.appliesToCategory, [
          'PRESCRIPTION',
          'OTC',
        ]),
      );
    await db
      .insert(schema.platformSettings)
      .values({ key: 'delivery_enabled', value: true, description: 'DEMO' })
      .onConflictDoUpdate({
        target: schema.platformSettings.key,
        set: { value: true },
      });

    console.log('\n✓ Demo data ready. Accounts (password below):');
    console.log(
      '  patient@demo.dewa.dz · owner1@demo.dewa.dz · pharmacist1@demo.dewa.dz · driver@demo.dewa.dz · company@demo.dewa.dz',
    );
    console.log(
      '  super@ / verification@ / support@ / finance@ / compliance@demo.dewa.dz (TOTP enrolment at first login)',
    );
    console.log(
      `  password: ${process.env.DEMO_PASSWORD ? '(DEMO_PASSWORD)' : password}`,
    );
    console.log(`  pharmacies: ${pharmacyIds.join(', ')}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
