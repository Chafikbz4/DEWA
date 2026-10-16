import { and, eq } from 'drizzle-orm';
import { authenticator } from 'otplib';
import {
  auditLogs,
  communes,
  pharmacyStaff,
  users,
} from '../src/database/schema';
import {
  bearer,
  CONSENTS,
  createTestApp,
  insertUser,
  lastOtp,
  loginAdmin,
  PASSWORD,
  registerPatient,
  setPharmacyStatus,
  TestCtx,
  uniquePhone,
} from './utils';

describe('RBAC, account status & admin (e2e)', () => {
  let ctx: TestCtx;
  let communeId: number;

  beforeAll(async () => {
    ctx = await createTestApp();
    const [c] = await ctx.db
      .select({ id: communes.id })
      .from(communes)
      .where(eq(communes.wilayaId, 16))
      .limit(1);
    communeId = c.id;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  async function registerPharmacyOwner() {
    const phone = uniquePhone();
    await ctx
      .http()
      .post('/auth/register/pharmacy')
      .send({
        phone,
        password: PASSWORD,
        first_name: 'Yacine',
        last_name: 'Owner',
        preferred_language: 'fr',
        consents: CONSENTS,
        pharmacist_license_number: 'PH-16-00987',
        pharmacy: {
          name_fr: 'Pharmacie Test',
          name_ar: 'صيدلية تجريبية',
          authorization_number: `AUT-${phone.slice(-8)}`,
          wilaya_id: 16,
          commune_id: communeId,
          address_line: '1 Rue de Test',
          latitude: 36.75,
          longitude: 3.05,
        },
      })
      .expect(202);
    const res = await ctx
      .http()
      .post('/auth/otp/verify')
      .send({ target: phone, purpose: 'REGISTER', code: lastOtp(ctx, phone) })
      .expect(200);
    const [staff] = await ctx.db
      .select()
      .from(pharmacyStaff)
      .where(eq(pharmacyStaff.userId, res.body.data.user.id));
    return {
      phone,
      token: res.body.data.access_token as string,
      userId: res.body.data.user.id as string,
      pharmacyId: staff.pharmacyId,
    };
  }

  it('rejects requests without a token', async () => {
    const res = await ctx.http().get('/me').expect(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_MISSING');
    await ctx.http().get('/me').set(bearer('not.a.jwt')).expect(401);
  });

  it('forbids patients from admin routes', async () => {
    const { access_token } = await registerPatient(ctx);
    const res = await ctx
      .http()
      .get('/admin/users')
      .set(bearer(access_token))
      .expect(403);
    expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
  });

  it('rejects a pharmacy whose authorization number or commune is invalid', async () => {
    const res = await ctx
      .http()
      .post('/auth/register/pharmacy')
      .send({
        phone: uniquePhone(),
        password: PASSWORD,
        first_name: 'A',
        last_name: 'B',
        preferred_language: 'fr',
        consents: CONSENTS,
        pharmacy: {
          name_fr: 'X',
          name_ar: 'س',
          authorization_number: 'AUT-BAD-GEO',
          wilaya_id: 1,
          commune_id: communeId,
          address_line: 'Somewhere',
        },
      })
      .expect(400);
    expect(res.body.error.code).toBe('GEO_INVALID_COMMUNE');
  });

  describe('pharmacy staff invitations', () => {
    it('enforces account status, pharmacy verification, staff role and membership', async () => {
      const owner = await registerPharmacyOwner();
      const invite = { phone: uniquePhone(), staff_role: 'PHARMACIST' };

      // Pharmacy owners are NOT self-activating.
      const me = await ctx
        .http()
        .get('/me')
        .set(bearer(owner.token))
        .expect(200);
      expect(me.body.data.status).toBe('PENDING_VERIFICATION');
      const pending = await ctx
        .http()
        .post(`/pharmacies/${owner.pharmacyId}/staff/invite`)
        .set(bearer(owner.token))
        .send(invite)
        .expect(403);
      expect(pending.body.error.code).toBe('ACCOUNT_PENDING_VERIFICATION');

      // Owner approved, pharmacy still DRAFT.
      await ctx.db
        .update(users)
        .set({ status: 'ACTIVE' })
        .where(eq(users.id, owner.userId));
      const draft = await ctx
        .http()
        .post(`/pharmacies/${owner.pharmacyId}/staff/invite`)
        .set(bearer(owner.token))
        .send(invite)
        .expect(403);
      expect(draft.body.error.code).toBe('PHARMACY_NOT_VERIFIED');

      await setPharmacyStatus(ctx, owner.pharmacyId, 'VERIFIED');
      const ok = await ctx
        .http()
        .post(`/pharmacies/${owner.pharmacyId}/staff/invite`)
        .set(bearer(owner.token))
        .send(invite)
        .expect(201);
      expect(ok.body.data).toMatchObject({
        staff_role: 'PHARMACIST',
        status: 'PENDING',
      });
      expect(JSON.stringify(ok.body)).not.toMatch(/token/i);

      // Another (verified) owner cannot act on this pharmacy.
      const other = await registerPharmacyOwner();
      await ctx.db
        .update(users)
        .set({ status: 'ACTIVE' })
        .where(eq(users.id, other.userId));
      await setPharmacyStatus(ctx, other.pharmacyId, 'VERIFIED');
      const foreign = await ctx
        .http()
        .post(`/pharmacies/${owner.pharmacyId}/staff/invite`)
        .set(bearer(other.token))
        .send(invite)
        .expect(403);
      expect(foreign.body.error.code).toBe('PHARMACY_ACCESS_DENIED');

      // Patients cannot even reach the route.
      const patient = await registerPatient(ctx);
      const p = await ctx
        .http()
        .post(`/pharmacies/${owner.pharmacyId}/staff/invite`)
        .set(bearer(patient.access_token))
        .send(invite)
        .expect(403);
      expect(p.body.error.code).toBe('ROLE_FORBIDDEN');

      // The invitee previews and accepts the invitation.
      const token = ctx.sms
        .lastTo(invite.phone)!
        .body.match(/: ([A-Za-z0-9_-]{40,})/)![1];
      const preview = await ctx
        .http()
        .post('/auth/invitations/preview')
        .send({ invitation_token: token })
        .expect(200);
      expect(preview.body.data).toMatchObject({
        pharmacy_name_fr: 'Pharmacie Test',
        staff_role: 'PHARMACIST',
      });

      const noLicense = await ctx
        .http()
        .post('/auth/register/staff')
        .send({
          invitation_token: token,
          password: PASSWORD,
          first_name: 'Karim',
          last_name: 'H',
          preferred_language: 'ar',
          consents: CONSENTS,
        })
        .expect(400);
      expect(noLicense.body.error.details[0].field).toBe(
        'pharmacist_license_number',
      );

      const staff = await ctx
        .http()
        .post('/auth/register/staff')
        .send({
          invitation_token: token,
          password: PASSWORD,
          first_name: 'Karim',
          last_name: 'H',
          preferred_language: 'ar',
          pharmacist_license_number: 'PH-1',
          consents: CONSENTS,
        })
        .expect(201);
      expect(staff.body.data.user).toMatchObject({
        role: 'PHARMACIST',
        status: 'PENDING_VERIFICATION',
      });

      const reuse = await ctx
        .http()
        .post('/auth/invitations/preview')
        .send({ invitation_token: token })
        .expect(400);
      expect(reuse.body.error.code).toBe('INVITATION_INVALID');

      // A pharmacist is staff, but not the owner.
      await ctx.db
        .update(users)
        .set({ status: 'ACTIVE' })
        .where(eq(users.id, staff.body.data.user.id));
      const notOwner = await ctx
        .http()
        .post(`/pharmacies/${owner.pharmacyId}/staff/invite`)
        .set(bearer(staff.body.data.access_token))
        .send(invite)
        .expect(403);
      expect(notOwner.body.error.code).toBe('ROLE_FORBIDDEN');
    });
  });

  describe('admins', () => {
    it('never issues tokens to an admin before TOTP enrolment, then requires TOTP at every login', async () => {
      const admin = await insertUser(ctx, 'ADMIN');
      const first = await ctx
        .http()
        .post('/auth/login')
        .send({ identifier: admin.email, password: PASSWORD })
        .expect(200);
      expect(first.body.data).toEqual({
        mfa_required: true,
        mfa_setup_required: true,
        mfa_token: expect.any(String),
      });
      expect(first.body.data.access_token).toBeUndefined();

      const { access, secret } = await loginAdmin(ctx, admin.email!);
      await ctx
        .http()
        .get('/admin/users?limit=5')
        .set(bearer(access))
        .expect(200);

      const second = await ctx
        .http()
        .post('/auth/login')
        .send({ identifier: admin.email, password: PASSWORD })
        .expect(200);
      expect(second.body.data).toMatchObject({
        mfa_required: true,
        mfa_setup_required: false,
      });
      const bad = await ctx
        .http()
        .post('/auth/login/mfa')
        .send({ mfa_token: second.body.data.mfa_token, code: '000000' })
        .expect(401);
      expect(bad.body.error.code).toBe('MFA_INVALID_CODE');
      const good = await ctx
        .http()
        .post('/auth/login/mfa')
        .send({
          mfa_token: second.body.data.mfa_token,
          code: authenticator.generate(secret),
        })
        .expect(200);
      expect(good.body.data.user.role).toBe('ADMIN');

      // MFA cannot be disabled by admins.
      const disable = await ctx
        .http()
        .post('/auth/mfa/disable')
        .set(bearer(good.body.data.access_token))
        .send({ code: authenticator.generate(secret), password: PASSWORD })
        .expect(403);
      expect(disable.body.error.code).toBe('MFA_MANDATORY_FOR_ROLE');
    });

    it('lists users with pagination + filters and audits the access', async () => {
      const admin = await insertUser(ctx, 'ADMIN');
      const { access } = await loginAdmin(ctx, admin.email!);
      const res = await ctx
        .http()
        .get(
          '/admin/users?role=PATIENT&status=ACTIVE&limit=3&sort=created_at&order=desc',
        )
        .set(bearer(access))
        .expect(200);
      expect(res.body.data.length).toBeLessThanOrEqual(3);
      expect(res.body.meta.pagination).toMatchObject({ page: 1, limit: 3 });
      res.body.data.forEach((u: { role: string }) =>
        expect(u.role).toBe('PATIENT'),
      );

      const audits = await ctx.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.actorUserId, admin.id),
            eq(auditLogs.action, 'ADMIN_USERS_LISTED'),
          ),
        );
      expect(audits.length).toBeGreaterThanOrEqual(1);
    });

    it('suspends a user (reason required, sessions revoked, audited) – role changes are super-admin only', async () => {
      const admin = await insertUser(ctx, 'ADMIN');
      const { access } = await loginAdmin(ctx, admin.email!);
      const patient = await registerPatient(ctx);

      const noReason = await ctx
        .http()
        .patch(`/admin/users/${patient.user.id}/status`)
        .set(bearer(access))
        .send({ status: 'SUSPENDED' })
        .expect(400);
      expect(noReason.body.error.code).toBe('VALIDATION_FAILED');

      await ctx
        .http()
        .patch(`/admin/users/${patient.user.id}/status`)
        .set(bearer(access))
        .send({
          status: 'SUSPENDED',
          reason: 'Fraudulent prescriptions – ticket #42',
        })
        .expect(200);
      expect(
        (
          await ctx
            .http()
            .get('/me')
            .set(bearer(patient.access_token))
            .expect(401)
        ).body.error.code,
      ).toBe('AUTH_SESSION_REVOKED');
      const login = await ctx
        .http()
        .post('/auth/login')
        .send({ identifier: patient.phone, password: PASSWORD })
        .expect(403);
      expect(login.body.error.code).toBe('ACCOUNT_SUSPENDED');

      const [audit] = await ctx.db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.resourceId, patient.user.id),
            eq(auditLogs.action, 'USER_STATUS_CHANGED'),
          ),
        );
      expect(audit).toMatchObject({
        actorUserId: admin.id,
        reason: 'Fraudulent prescriptions – ticket #42',
        metadata: { from: 'ACTIVE', to: 'SUSPENDED' },
      });

      const role = await ctx
        .http()
        .patch(`/admin/users/${patient.user.id}/role`)
        .set(bearer(access))
        .send({ role: 'ADMIN', reason: 'not allowed for ADMIN' })
        .expect(403);
      expect(role.body.error.code).toBe('ROLE_FORBIDDEN');

      const self = await ctx
        .http()
        .patch(`/admin/users/${admin.id}/status`)
        .set(bearer(access))
        .send({ status: 'SUSPENDED', reason: 'testing self' })
        .expect(403);
      expect(self.body.error.code).toBe('CANNOT_MODIFY_SELF');
    });

    it('super admin creates an admin who is activated by MFA enrolment, and changes roles', async () => {
      const superAdmin = await insertUser(ctx, 'SUPER_ADMIN');
      const { access } = await loginAdmin(ctx, superAdmin.email!);
      const email = `new.admin.${Date.now()}@test.dewa.dz`;

      const created = await ctx
        .http()
        .post('/admin/users')
        .set(bearer(access))
        .send({
          email,
          first_name: 'Nadia',
          last_name: 'Kaci',
          password: PASSWORD,
          preferred_language: 'fr',
          reason: 'New ops team member',
        })
        .expect(201);
      expect(created.body.data).toMatchObject({
        role: 'ADMIN',
        status: 'PENDING_VERIFICATION',
        mfa_enabled: false,
      });

      const newAdmin = await loginAdmin(ctx, email);
      const me = await ctx
        .http()
        .get('/me')
        .set(bearer(newAdmin.access))
        .expect(200);
      expect(me.body.data).toMatchObject({
        role: 'ADMIN',
        status: 'ACTIVE',
        mfa_enabled: true,
      });

      const patient = await registerPatient(ctx);
      const changed = await ctx
        .http()
        .patch(`/admin/users/${patient.user.id}/role`)
        .set(bearer(access))
        .send({ role: 'DRIVER', reason: 'User asked to become a driver' })
        .expect(200);
      expect(changed.body.data.role).toBe('DRIVER');
      await ctx.http().get('/me').set(bearer(patient.access_token)).expect(401);
    });
  });
});
