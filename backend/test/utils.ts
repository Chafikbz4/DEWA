import { INestApplication } from '@nestjs/common';
import { parse } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import { authenticator } from 'otplib';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { hashPassword } from '../src/common/crypto/password';
import { Database, DRIZZLE } from '../src/database/database.module';
import { pharmacies, Role, staffProfiles, users } from '../src/database/schema';
import {
  ConsoleEmailProvider,
  ConsoleSmsProvider,
  EMAIL_PROVIDER,
  SMS_PROVIDER,
} from '../src/modules/messaging-providers/providers';

export const PASSWORD = 'Str0ngPassw0rd';
export const CONSENTS = [
  { type: 'TERMS', version: '2026-10' },
  { type: 'PRIVACY', version: '2026-10' },
];

export interface TestCtx {
  app: INestApplication;
  db: Database;
  http: () => ReturnType<typeof request>;
  sms: ConsoleSmsProvider;
  email: ConsoleEmailProvider;
}

export async function createTestApp(): Promise<TestCtx> {
  assertTestDatabase();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication({
    bodyParser: false,
    logger: ['error'],
  });
  configureApp(app);
  await app.init();
  return {
    app,
    db: app.get(DRIZZLE),
    http: () => request(app.getHttpServer()),
    sms: app.get(SMS_PROVIDER),
    email: app.get(EMAIL_PROVIDER),
  };
}

/** Hard stop if the app would talk to anything but the .env.test database. */
function assertTestDatabase() {
  const expected = parse(readFileSync('.env.test')).DATABASE_URL;
  if (!expected || process.env.DATABASE_URL !== expected) {
    throw new Error(
      'e2e safety check failed: DATABASE_URL is not the .env.test database',
    );
  }
  const local = existsSync('.env.local')
    ? parse(readFileSync('.env.local'))
    : {};
  const host = (u?: string) =>
    u ? new URL(u).hostname.replace('-pooler', '') : '';
  if (host(expected) === host(local.DATABASE_URL)) {
    throw new Error(
      'e2e safety check failed: .env.test points at the same Neon endpoint as .env.local',
    );
  }
}

const rand = (digits: number) =>
  Array.from({ length: digits }, () => Math.floor(Math.random() * 10)).join('');

/** Unique valid Algerian mobile number (Mobilis 66x range). */
export const uniquePhone = () => `+213661${rand(6)}`;
export const uniqueEmail = () => `e2e.${Date.now()}.${rand(5)}@test.dewa.dz`;

export function lastOtp(ctx: TestCtx, target: string): string {
  const msg = target.includes('@')
    ? ctx.email.lastTo(target)
    : ctx.sms.lastTo(target);
  const code = msg?.body.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`No OTP found for ${target}`);
  return code;
}

/** Registers + verifies a patient, returns the login payload. */
export async function registerPatient(ctx: TestCtx, phone = uniquePhone()) {
  await ctx
    .http()
    .post('/auth/register/patient')
    .send({
      phone,
      password: PASSWORD,
      first_name: 'Amina',
      last_name: 'Benali',
      preferred_language: 'fr',
      consents: CONSENTS,
    })
    .expect(202);
  const res = await ctx
    .http()
    .post('/auth/otp/verify')
    .send({ target: phone, purpose: 'REGISTER', code: lastOtp(ctx, phone) })
    .expect(200);
  return { phone, ...res.body.data } as {
    phone: string;
    access_token: string;
    refresh_token: string;
    user: { id: string; role: Role; status: string };
  };
}

/** Inserts an account directly (for roles that cannot self-register, e.g. admins). */
export async function insertUser(
  ctx: TestCtx,
  role: Role,
  over: Partial<typeof users.$inferInsert> = {},
) {
  const email = uniqueEmail();
  const [u] = await ctx.db
    .insert(users)
    .values({
      role,
      email,
      emailVerifiedAt: new Date(),
      passwordHash: await hashPassword(PASSWORD),
      status: 'ACTIVE',
      ...over,
    })
    .returning();
  await ctx.db
    .insert(staffProfiles)
    .values({ userId: u.id, firstName: 'Test', lastName: role });
  return u;
}

/** Full admin login incl. mandatory TOTP enrolment. Returns access token + TOTP secret. */
export async function loginAdmin(ctx: TestCtx, email: string) {
  const login = await ctx
    .http()
    .post('/auth/login')
    .send({ identifier: email, password: PASSWORD })
    .expect(200);
  const mfaToken = login.body.data.mfa_token as string;
  const setup = await ctx
    .http()
    .post('/auth/mfa/setup')
    .send({ mfa_token: mfaToken })
    .expect(200);
  const secret = setup.body.data.secret as string;
  const enabled = await ctx
    .http()
    .post('/auth/mfa/enable')
    .send({ mfa_token: mfaToken, code: authenticator.generate(secret) })
    .expect(200);
  return { access: enabled.body.data.access_token as string, secret };
}

export async function setPharmacyStatus(
  ctx: TestCtx,
  pharmacyId: string,
  status: 'VERIFIED' | 'DRAFT',
) {
  await ctx.db
    .update(pharmacies)
    .set({ status })
    .where(eq(pharmacies.id, pharmacyId));
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// ------------------------------------------------------------ marketplace fixtures

import { sql as dsql } from 'drizzle-orm';
import {
  communes as communesT,
  eligibilityPolicies,
  medicines,
  pharmacyOpeningHours,
  pharmacyServiceAreas,
  pharmacyStaff as pharmacyStaffT,
} from '../src/database/schema';
import { JobQueueService } from '../src/modules/jobs/job-queue.service';

/** 1×1 PNG. */
export const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

export async function login(
  ctx: TestCtx,
  identifier: string,
  password = PASSWORD,
) {
  const res = await ctx
    .http()
    .post('/auth/login')
    .send({ identifier, password })
    .expect(200);
  return res.body.data.access_token as string;
}

/** Picks a random commune and disables pre-existing pharmacies there (isolation between runs). */
export async function isolatedCommune(ctx: TestCtx) {
  const [c] = await ctx.db
    .select({ id: communesT.id, wilayaId: communesT.wilayaId })
    .from(communesT)
    .orderBy(dsql`random()`)
    .limit(1);
  await ctx.db
    .update(pharmacies)
    .set({ acceptsRequests: false })
    .where(eq(pharmacies.communeId, c.id));
  return c;
}

export interface PharmacyFixture {
  pharmacyId: string;
  ownerId: string;
  ownerEmail: string;
  ownerToken: string;
}

/** A VERIFIED pharmacy (open 24/7 unless open=false) with an ACTIVE owner. */
export async function createPharmacy(
  ctx: TestCtx,
  opts: {
    wilayaId: number;
    communeId: number;
    lat?: number;
    lng?: number;
    open?: boolean;
    delivery?: boolean;
    status?: 'VERIFIED' | 'DRAFT';
  },
): Promise<PharmacyFixture> {
  const owner = await insertUser(ctx, 'PHARMACY_OWNER');
  const [p] = await ctx.db
    .insert(pharmacies)
    .values({
      nameFr: `Pharmacie E2E ${owner.id.slice(0, 6)}`,
      nameAr: 'صيدلية اختبار',
      authorizationNumber: `E2E-${owner.id}`,
      wilayaId: opts.wilayaId,
      communeId: opts.communeId,
      addressLine: '1 Rue E2E',
      latitude: opts.lat ?? 36.75,
      longitude: opts.lng ?? 3.05,
      status: opts.status ?? 'VERIFIED',
      acceptsRequests: true,
      deliveryAvailable: opts.delivery ?? false,
    })
    .returning({ id: pharmacies.id });
  await ctx.db
    .insert(pharmacyStaffT)
    .values({ pharmacyId: p.id, userId: owner.id, staffRole: 'OWNER' });
  await ctx.db.insert(pharmacyServiceAreas).values({
    pharmacyId: p.id,
    wilayaId: opts.wilayaId,
    communeId: opts.communeId,
  });
  if (opts.open !== false) {
    await ctx.db.insert(pharmacyOpeningHours).values(
      [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        pharmacyId: p.id,
        dayOfWeek: d,
        is24h: true,
      })),
    );
  }
  return {
    pharmacyId: p.id,
    ownerId: owner.id,
    ownerEmail: owner.email!,
    ownerToken: await login(ctx, owner.email!),
  };
}

export async function addStaff(
  ctx: TestCtx,
  pharmacyId: string,
  staffRole: 'PHARMACIST' | 'ASSISTANT',
) {
  const u = await insertUser(
    ctx,
    staffRole === 'PHARMACIST' ? 'PHARMACIST' : 'PHARMACY_ASSISTANT',
  );
  await ctx.db
    .insert(pharmacyStaffT)
    .values({ pharmacyId, userId: u.id, staffRole });
  return { userId: u.id, token: await login(ctx, u.email!) };
}

/** Enables a category policy (test DB only) – production requires a real legal review. */
export async function enablePolicy(
  ctx: TestCtx,
  category: 'PRESCRIPTION' | 'OTC',
  flags: { delivery?: boolean; payment?: boolean } = {},
) {
  const reviewer = await insertUser(ctx, 'SUPER_ADMIN');
  await ctx.db
    .update(eligibilityPolicies)
    .set({
      isEnabled: true,
      allowedOnlineRequest: true,
      allowedDelivery: flags.delivery ?? false,
      allowedOnlinePayment: flags.payment ?? true,
      legalBasisReference: 'E2E TEST ONLY – not a legal basis',
      reviewedBy: reviewer.id,
      reviewedAt: new Date(),
    })
    .where(eq(eligibilityPolicies.appliesToCategory, category));
}

export async function createMedicine(
  ctx: TestCtx,
  category: 'OTC' | 'PRESCRIPTION' | 'CONTROLLED',
  name = 'Med',
) {
  const [m] = await ctx.db
    .insert(medicines)
    .values({
      brandName: `${name} ${Date.now()}`,
      innDci: name.toLowerCase(),
      category,
      requiresPrescription: category !== 'OTC',
    })
    .returning({ id: medicines.id });
  return m.id;
}

export async function uploadFile(
  ctx: TestCtx,
  token: string,
  purpose: string,
  content = PNG,
  name = 'page.png',
) {
  const res = await ctx
    .http()
    .post('/files/upload')
    .set(bearer(token))
    .field('purpose', purpose)
    .attach('files', content, name)
    .expect(201);
  return res.body.data[0].id as string;
}

export async function createAddress(
  ctx: TestCtx,
  token: string,
  wilayaId: number,
  communeId: number,
  lat = 36.7501,
  lng = 3.0501,
) {
  const res = await ctx
    .http()
    .post('/patients/me/addresses')
    .set(bearer(token))
    .send({
      wilaya_id: wilayaId,
      commune_id: communeId,
      street_line: '5 Rue Patient',
      latitude: lat,
      longitude: lng,
    })
    .expect(201);
  return res.body.data.id as string;
}

export const drainJobs = (ctx: TestCtx) => ctx.app.get(JobQueueService).drain();

/** Polls until `check` returns a truthy value (async listeners / background jobs). */
export async function waitFor<T>(
  check: () => Promise<T | undefined | null | false>,
  timeoutMs = 10_000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeoutMs)
      throw new Error('waitFor: condition not met in time');
    await new Promise((r) => setTimeout(r, 100));
  }
}
