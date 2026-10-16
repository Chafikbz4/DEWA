import { and, eq } from 'drizzle-orm';
import { auditLogs, users } from '../src/database/schema';
import {
  bearer,
  CONSENTS,
  createTestApp,
  lastOtp,
  PASSWORD,
  registerPatient,
  TestCtx,
  uniqueEmail,
  uniquePhone,
} from './utils';

describe('Auth (e2e)', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  describe('registration + OTP', () => {
    it('registers a patient, verifies the OTP and activates the account', async () => {
      const phone = uniquePhone();
      const reg = await ctx
        .http()
        .post('/auth/register/patient')
        .send({
          phone,
          password: PASSWORD,
          first_name: 'Amina',
          last_name: 'Benali',
          preferred_language: 'ar',
          consents: CONSENTS,
        })
        .expect(202);
      expect(reg.body).toMatchObject({
        success: true,
        data: { otp_sent: true, expires_in: 300 },
        error: null,
      });
      expect(reg.body.data.target_masked).toMatch(/^\+213\*+\d{4}$/);

      const code = lastOtp(ctx, phone);
      const res = await ctx
        .http()
        .post('/auth/otp/verify')
        .send({ target: phone, purpose: 'REGISTER', code })
        .expect(200);
      expect(res.body.data).toMatchObject({
        token_type: 'Bearer',
        expires_in: 900,
        user: { role: 'PATIENT', status: 'ACTIVE', preferred_language: 'ar' },
      });
      expect(res.body.data.refresh_token).toBeDefined();

      const me = await ctx
        .http()
        .get('/me')
        .set(bearer(res.body.data.access_token))
        .expect(200);
      expect(me.body.data).toMatchObject({
        phone,
        phone_verified: true,
        first_name: 'Amina',
        status: 'ACTIVE',
      });
    });

    it('does not reveal that an account already exists', async () => {
      const { phone } = await registerPatient(ctx);
      const again = await ctx
        .http()
        .post('/auth/register/patient')
        .send({
          phone,
          password: 'An0therPassw0rd',
          first_name: 'X',
          last_name: 'Y',
          preferred_language: 'fr',
          consents: CONSENTS,
        })
        .expect(202);
      expect(Object.keys(again.body.data).sort()).toEqual([
        'expires_in',
        'otp_sent',
        'target_masked',
      ]);
      // The real owner is told someone tried, and receives no code.
      expect(ctx.sms.lastTo(phone)?.body).toMatch(/déjà un compte/);
      expect(ctx.sms.lastTo(phone)?.body).not.toMatch(/\b\d{6}\b/);
    });

    it('requires TERMS + PRIVACY consents', async () => {
      const res = await ctx
        .http()
        .post('/auth/register/patient')
        .send({
          phone: uniquePhone(),
          password: PASSWORD,
          first_name: 'A',
          last_name: 'B',
          preferred_language: 'fr',
          consents: [
            CONSENTS[0],
            { type: 'HEALTH_DATA_PROCESSING', version: 'v1' },
          ],
        })
        .expect(400);
      expect(res.body.error.code).toBe('AUTH_CONSENT_REQUIRED');
    });

    it('rejects weak passwords and unknown fields with field-level i18n errors', async () => {
      const res = await ctx
        .http()
        .post('/auth/register/patient')
        .set('Accept-Language', 'ar')
        .send({
          phone: uniquePhone(),
          password: 'weak',
          first_name: 'A',
          last_name: 'B',
          preferred_language: 'fr',
          consents: CONSENTS,
          role: 'ADMIN',
        })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      const fields = res.body.error.details.map(
        (d: { field: string }) => d.field,
      );
      expect(fields).toEqual(expect.arrayContaining(['password', 'role']));
      expect(res.body.error.message).toMatch(/[؀-ۿ]/);
    });

    it('locks an OTP after 5 wrong attempts', async () => {
      const phone = uniquePhone();
      await ctx
        .http()
        .post('/auth/register/patient')
        .send({
          phone,
          password: PASSWORD,
          first_name: 'A',
          last_name: 'B',
          preferred_language: 'fr',
          consents: CONSENTS,
        })
        .expect(202);
      const good = lastOtp(ctx, phone);
      const bad = good === '000000' ? '111111' : '000000';
      const codes: string[] = [];
      for (let i = 0; i < 5; i++) {
        const r = await ctx
          .http()
          .post('/auth/otp/verify')
          .send({ target: phone, purpose: 'REGISTER', code: bad });
        codes.push(r.body.error.code);
      }
      expect(codes).toEqual([
        'OTP_INVALID',
        'OTP_INVALID',
        'OTP_INVALID',
        'OTP_INVALID',
        'OTP_TOO_MANY_ATTEMPTS',
      ]);
      const after = await ctx
        .http()
        .post('/auth/otp/verify')
        .send({ target: phone, purpose: 'REGISTER', code: good });
      expect(after.body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
    });

    it('registers with email and verifies via email OTP', async () => {
      const email = uniqueEmail();
      await ctx
        .http()
        .post('/auth/register/patient')
        .send({
          email,
          password: PASSWORD,
          first_name: 'Sara',
          last_name: 'K',
          preferred_language: 'fr',
          consents: CONSENTS,
        })
        .expect(202);
      const res = await ctx
        .http()
        .post('/auth/otp/verify')
        .send({ target: email, purpose: 'REGISTER', code: lastOtp(ctx, email) })
        .expect(200);
      expect(res.body.data.user.status).toBe('ACTIVE');
    });
  });

  describe('login', () => {
    it('logs in with phone + password and with phone + SMS code', async () => {
      const { phone } = await registerPatient(ctx);
      const pw = await ctx
        .http()
        .post('/auth/login')
        .send({ identifier: phone, password: PASSWORD })
        .expect(200);
      expect(pw.body.data.access_token).toBeDefined();

      // Local format is normalised to E.164.
      const local = '0' + phone.slice(4);
      await ctx
        .http()
        .post('/auth/login')
        .send({ identifier: local, password: PASSWORD })
        .expect(200);

      await ctx
        .http()
        .post('/auth/otp/request')
        .send({ target: phone, purpose: 'LOGIN' })
        .expect(202);
      const otp = await ctx
        .http()
        .post('/auth/login/otp')
        .send({ phone, code: lastOtp(ctx, phone) })
        .expect(200);
      expect(otp.body.data.user.role).toBe('PATIENT');
    });

    it('returns the same generic error for a wrong password and an unknown account', async () => {
      const { phone } = await registerPatient(ctx);
      const wrong = await ctx
        .http()
        .post('/auth/login')
        .send({ identifier: phone, password: 'WrongPassw0rd' })
        .expect(401);
      const unknown = await ctx
        .http()
        .post('/auth/login')
        .send({ identifier: uniquePhone(), password: 'WrongPassw0rd' })
        .expect(401);
      expect(wrong.body.error).toEqual(unknown.body.error);
      expect(wrong.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('locks the account after 5 failures and only reveals it with the right password', async () => {
      const { phone, user } = await registerPatient(ctx);
      for (let i = 0; i < 5; i++) {
        await ctx
          .http()
          .post('/auth/login')
          .send({ identifier: phone, password: 'WrongPassw0rd' })
          .expect(401);
      }
      const locked = await ctx
        .http()
        .post('/auth/login')
        .send({ identifier: phone, password: PASSWORD })
        .expect(401);
      expect(locked.body.error.code).toBe('AUTH_ACCOUNT_LOCKED');
      expect(locked.body.error.message).toMatch(/\d+ minutes/);
      const wrong = await ctx
        .http()
        .post('/auth/login')
        .send({ identifier: phone, password: 'WrongPassw0rd' })
        .expect(401);
      expect(wrong.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');

      const [row] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, user.id));
      expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
      const audits = await ctx.db
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.actorUserId, user.id),
            eq(auditLogs.action, 'AUTH_ACCOUNT_LOCKED'),
          ),
        );
      expect(audits).toHaveLength(1);
    });
  });

  describe('refresh tokens', () => {
    it('rotates refresh tokens and detects reuse (revokes the whole family)', async () => {
      const { refresh_token: r1 } = await registerPatient(ctx);

      const second = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refresh_token: r1 })
        .expect(200);
      const r2 = second.body.data.refresh_token as string;
      expect(r2).not.toEqual(r1);
      await ctx
        .http()
        .get('/me')
        .set(bearer(second.body.data.access_token))
        .expect(200);

      // Replaying the already-rotated token = theft.
      const reuse = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refresh_token: r1 })
        .expect(401);
      expect(reuse.body.error.code).toBe('AUTH_REFRESH_REUSED');

      // The legitimate newest token is now dead too, and so is its access token.
      const r2Res = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refresh_token: r2 })
        .expect(401);
      expect(r2Res.body.error.code).toBe('AUTH_REFRESH_INVALID');
      const me = await ctx
        .http()
        .get('/me')
        .set(bearer(second.body.data.access_token))
        .expect(401);
      expect(me.body.error.code).toBe('AUTH_SESSION_REVOKED');
    });

    it('binds refresh to the device after biometric enrolment', async () => {
      const { access_token, refresh_token } = await registerPatient(ctx);
      await ctx
        .http()
        .post('/auth/devices')
        .set(bearer(access_token))
        .send({
          device_id: 'device-AAAA-1111',
          platform: 'android',
          biometric_enabled: true,
          app_version: '1.0.0',
        })
        .expect(201);

      const noDevice = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refresh_token })
        .expect(401);
      expect(noDevice.body.error.code).toBe('AUTH_DEVICE_MISMATCH');
      const ok = await ctx
        .http()
        .post('/auth/refresh')
        .send({ refresh_token, device_id: 'device-AAAA-1111' })
        .expect(200);

      const me = await ctx
        .http()
        .get('/me')
        .set(bearer(ok.body.data.access_token))
        .expect(200);
      expect(me.body.data.biometric_enabled).toBe(true);

      const devices = await ctx
        .http()
        .get('/auth/devices')
        .set(bearer(ok.body.data.access_token))
        .expect(200);
      expect(devices.body.meta.pagination).toMatchObject({ page: 1, total: 1 });
      await ctx
        .http()
        .delete(`/auth/devices/${devices.body.data[0].id}`)
        .set(bearer(ok.body.data.access_token))
        .expect(200);
      // Removing the device revoked its sessions.
      await ctx
        .http()
        .get('/me')
        .set(bearer(ok.body.data.access_token))
        .expect(401);
    });
  });

  describe('sessions', () => {
    it('lists sessions, revokes one, logs out everywhere', async () => {
      const { phone, access_token: a1 } = await registerPatient(ctx);
      const second = await ctx
        .http()
        .post('/auth/login')
        .send({ identifier: phone, password: PASSWORD })
        .expect(200);
      const a2 = second.body.data.access_token as string;

      const list = await ctx
        .http()
        .get('/auth/sessions?limit=10')
        .set(bearer(a1))
        .expect(200);
      expect(list.body.meta.pagination.total).toBe(2);
      const other = list.body.data.find(
        (s: { current: boolean }) => !s.current,
      );

      await ctx
        .http()
        .delete(`/auth/sessions/${other.id}`)
        .set(bearer(a1))
        .expect(200);
      expect(
        (await ctx.http().get('/me').set(bearer(a2)).expect(401)).body.error
          .code,
      ).toBe('AUTH_SESSION_REVOKED');

      await ctx.http().post('/auth/logout-all').set(bearer(a1)).expect(200);
      await ctx.http().get('/me').set(bearer(a1)).expect(401);
    });

    it('cannot revoke another user’s session (ownership → 404)', async () => {
      const alice = await registerPatient(ctx);
      const bob = await registerPatient(ctx);
      const bobSessions = await ctx
        .http()
        .get('/auth/sessions')
        .set(bearer(bob.access_token))
        .expect(200);
      const res = await ctx
        .http()
        .delete(`/auth/sessions/${bobSessions.body.data[0].id}`)
        .set(bearer(alice.access_token))
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      await ctx.http().get('/me').set(bearer(bob.access_token)).expect(200);
    });

    it('logout revokes only the current session', async () => {
      const { access_token } = await registerPatient(ctx);
      await ctx
        .http()
        .post('/auth/logout')
        .set(bearer(access_token))
        .expect(200);
      await ctx.http().get('/me').set(bearer(access_token)).expect(401);
    });
  });

  describe('passwords', () => {
    it('resets a forgotten password (single-use token, all sessions revoked)', async () => {
      const { phone, refresh_token } = await registerPatient(ctx);
      await ctx
        .http()
        .post('/auth/password/forgot')
        .send({ identifier: phone })
        .expect(202);
      const verify = await ctx
        .http()
        .post('/auth/otp/verify')
        .send({
          target: phone,
          purpose: 'RESET_PASSWORD',
          code: lastOtp(ctx, phone),
        })
        .expect(200);
      const resetToken = verify.body.data.reset_token as string;

      await ctx
        .http()
        .post('/auth/password/reset')
        .send({ reset_token: resetToken, new_password: 'Brand9NewPassword' })
        .expect(200);
      const reuse = await ctx
        .http()
        .post('/auth/password/reset')
        .send({ reset_token: resetToken, new_password: 'Other9Password1' })
        .expect(400);
      expect(reuse.body.error.code).toBe('OTP_INVALID');

      await ctx
        .http()
        .post('/auth/refresh')
        .send({ refresh_token })
        .expect(401);
      await ctx
        .http()
        .post('/auth/login')
        .send({ identifier: phone, password: PASSWORD })
        .expect(401);
      await ctx
        .http()
        .post('/auth/login')
        .send({ identifier: phone, password: 'Brand9NewPassword' })
        .expect(200);
    });

    it('changes password, keeping only the current session', async () => {
      const { phone, access_token } = await registerPatient(ctx);
      const other = await ctx
        .http()
        .post('/auth/login')
        .send({ identifier: phone, password: PASSWORD })
        .expect(200);

      const wrong = await ctx
        .http()
        .post('/auth/password/change')
        .set(bearer(access_token))
        .send({
          current_password: 'Nope1234567',
          new_password: 'Brand9NewPassword',
        })
        .expect(400);
      expect(wrong.body.error.code).toBe('AUTH_PASSWORD_INCORRECT');

      await ctx
        .http()
        .post('/auth/password/change')
        .set(bearer(access_token))
        .send({ current_password: PASSWORD, new_password: 'Brand9NewPassword' })
        .expect(200);
      await ctx.http().get('/me').set(bearer(access_token)).expect(200);
      await ctx
        .http()
        .get('/me')
        .set(bearer(other.body.data.access_token))
        .expect(401);
    });
  });

  describe('consents', () => {
    it('grants and revokes optional consents; TERMS cannot be revoked', async () => {
      const { access_token } = await registerPatient(ctx);
      await ctx
        .http()
        .post('/me/consents')
        .set(bearer(access_token))
        .send({ type: 'HEALTH_DATA_PROCESSING', version: 'v1' })
        .expect(201);
      const list = await ctx
        .http()
        .get('/me/consents?active=true')
        .set(bearer(access_token))
        .expect(200);
      expect(
        list.body.data.map((c: { type: string }) => c.type).sort(),
      ).toEqual(['HEALTH_DATA_PROCESSING', 'PRIVACY', 'TERMS']);

      await ctx
        .http()
        .delete('/me/consents/HEALTH_DATA_PROCESSING')
        .set(bearer(access_token))
        .expect(200);
      const terms = await ctx
        .http()
        .delete('/me/consents/TERMS')
        .set(bearer(access_token))
        .expect(400);
      expect(terms.body.error.code).toBe('CONSENT_REQUIRED_NOT_REVOCABLE');
    });
  });
});
