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
