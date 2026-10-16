import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { authenticator } from 'otplib';
import {
  AdminSubRole,
  DEFAULT_ROLE_PERMISSIONS,
  Permission,
  PERMISSIONS as P,
  SUPER_ADMIN_ONLY,
} from '../src/common/auth/permissions';
import {
  adminUserRoles,
  drivers,
  eligibilityPolicies,
  notifications,
  pharmacies,
  pharmacyDocuments,
  platformSettingChanges,
  sensitiveAccessGrants,
  sensitiveAccessLogs,
  users,
} from '../src/database/schema';
import {
  addStaff,
  bearer,
  createAddress,
  createPharmacy,
  createTestApp,
  enablePolicy,
  insertUser,
  isolatedCommune,
  login,
  loginAdmin,
  PharmacyFixture,
  registerPatient,
  TestCtx,
  uploadFile,
  waitFor,
} from './utils';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
const X = randomUUID();

/** Every admin endpoint with the permission it requires ('super' = SUPER_ADMIN only, 'any' = any MFA admin). */
const MATRIX: [Method, string, Permission | 'any'][] = [
  ['get', '/admin/me/permissions', 'any'],
  ['get', '/admin/permissions', SUPER_ADMIN_ONLY],
  ['put', '/admin/permissions/SUPPORT_ADMIN', SUPER_ADMIN_ONLY],
  ['put', `/admin/users/${X}/admin-roles`, SUPER_ADMIN_ONLY],
  ['post', '/admin/users', SUPER_ADMIN_ONLY],
  ['patch', `/admin/users/${X}/role`, SUPER_ADMIN_ONLY],
  ['get', '/admin/users', P.USERS_READ],
  ['get', `/admin/users/${X}`, P.USERS_READ],
  ['post', `/admin/users/${X}/suspend`, P.USERS_MANAGE],
  ['post', `/admin/users/${X}/reactivate`, P.USERS_MANAGE],
  ['get', '/admin/verification/pharmacies', P.VERIFICATION_READ],
  ['get', `/admin/verification/drivers/${X}`, P.VERIFICATION_READ],
  [
    'post',
    `/admin/verification/pharmacies/${X}/approve`,
    P.VERIFICATION_DECIDE,
  ],
  ['post', `/admin/verification/drivers/${X}/reject`, P.VERIFICATION_DECIDE],
  [
    'post',
    `/admin/verification/delivery-companies/${X}/request-documents`,
    P.VERIFICATION_DECIDE,
  ],
  ['get', '/admin/requests', P.MONITORING_READ],
  ['get', `/admin/requests/${X}`, P.MONITORING_READ],
  ['get', `/admin/requests/${X}/content`, P.SENSITIVE_ACCESS],
  ['get', '/admin/orders', P.MONITORING_READ],
  ['get', `/admin/orders/${X}`, P.MONITORING_READ],
  ['get', `/admin/conversations/${X}/messages`, P.SENSITIVE_ACCESS],
  ['post', '/admin/sensitive-access', P.SENSITIVE_ACCESS],
  ['get', '/admin/sensitive-access', 'any'],
  ['get', '/admin/payments/dashboard', P.PAYMENTS_READ],
  ['get', '/admin/payments/reconciliation', P.PAYMENTS_READ],
  ['post', `/admin/payments/reconciliation/${X}/resolve`, P.REFUNDS_DECIDE],
  ['get', '/admin/refunds', P.PAYMENTS_READ],
  ['post', `/admin/refunds/${X}/approve`, P.REFUNDS_DECIDE],
  ['post', `/admin/refunds/${X}/reject`, P.REFUNDS_DECIDE],
  ['get', '/admin/settlements', P.PAYMENTS_READ],
  ['post', '/admin/settlements/generate', P.SETTLEMENTS_MANAGE],
  ['post', `/admin/settlements/${X}/mark-paid`, P.SETTLEMENTS_MANAGE],
  ['get', '/admin/delivery/zones', P.DELIVERY_CONFIG_MANAGE],
  ['post', '/admin/delivery/fee-rules', P.DELIVERY_CONFIG_MANAGE],
  ['patch', '/admin/delivery/settings', P.DELIVERY_CONFIG_MANAGE],
  ['get', '/admin/complaints', P.COMPLAINTS_READ],
  ['post', `/admin/complaints/${X}/assign`, P.COMPLAINTS_MANAGE],
  ['post', `/admin/complaints/${X}/resolve`, P.COMPLAINTS_MANAGE],
  ['get', '/admin/commission-rules', P.COMMISSION_MANAGE],
  ['post', '/admin/commission-rules', P.COMMISSION_MANAGE],
  ['get', '/admin/eligibility-policies', P.ELIGIBILITY_MANAGE],
  ['patch', `/admin/eligibility-policies/${X}`, P.ELIGIBILITY_MANAGE],
  ['get', '/admin/medicines', P.CATALOG_MANAGE],
  ['post', '/admin/medicines', P.CATALOG_MANAGE],
  ['get', '/admin/analytics/overview', P.ANALYTICS_READ],
  ['get', '/admin/audit-logs', P.AUDIT_READ],
  ['get', '/admin/audit-logs/export', P.AUDIT_READ],
  ['get', '/admin/security-events', P.SECURITY_READ],
  ['get', '/admin/settings', P.SETTINGS_MANAGE],
  ['patch', '/admin/settings/ocr_enabled', P.SETTINGS_MANAGE],
  ['get', '/admin/notification-templates', P.TEMPLATES_MANAGE],
  [
    'put',
    '/admin/notification-templates/ORDER_STATUS_CHANGED/fr',
    P.TEMPLATES_MANAGE,
  ],
];

describe('Admin domain – least privilege (e2e)', () => {
  let ctx: TestCtx;
  let area: { id: number; wilayaId: number };
  let ph: PharmacyFixture;
  let pharmacist: { userId: string; token: string };
  const tokens = {} as Record<
    AdminSubRole | 'NONE' | 'SUPER',
    { id: string; token: string }
  >;

  async function createAdmin(
    roles: AdminSubRole[],
    role: 'ADMIN' | 'SUPER_ADMIN' = 'ADMIN',
  ) {
    const u = await insertUser(ctx, role);
    if (roles.length)
      await ctx.db
        .insert(adminUserRoles)
        .values(roles.map((adminRole) => ({ userId: u.id, adminRole })));
    return {
      id: u.id,
      email: u.email!,
      token: (await loginAdmin(ctx, u.email!)).access,
    };
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    area = await isolatedCommune(ctx);
    await enablePolicy(ctx, 'PRESCRIPTION');
    ph = await createPharmacy(ctx, {
      wilayaId: area.wilayaId,
      communeId: area.id,
    });
    pharmacist = await addStaff(ctx, ph.pharmacyId, 'PHARMACIST');
    for (const r of [
      'VERIFICATION_ADMIN',
      'SUPPORT_ADMIN',
      'FINANCE_ADMIN',
      'COMPLIANCE_ADMIN',
    ] as AdminSubRole[])
      tokens[r] = await createAdmin([r]);
    tokens.NONE = await createAdmin([]);
    tokens.SUPER = await createAdmin([], 'SUPER_ADMIN');
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  const call = (m: Method, path: string, token: string) =>
    ctx.http()[m](path).set(bearer(token)).send({});

  it('enforces the permission matrix on every admin endpoint for every sub-role', async () => {
    const failures: string[] = [];
    for (const who of [
      'VERIFICATION_ADMIN',
      'SUPPORT_ADMIN',
      'FINANCE_ADMIN',
      'COMPLIANCE_ADMIN',
      'NONE',
      'SUPER',
    ] as const) {
      const perms = new Set<Permission>(
        who === 'NONE'
          ? []
          : who === 'SUPER'
            ? []
            : DEFAULT_ROLE_PERMISSIONS[who],
      );
      // Batches keep the run short without flooding the pool / rate limiter.
      for (let i = 0; i < MATRIX.length; i += 13) {
        await Promise.all(
          MATRIX.slice(i, i + 13).map(async ([m, path, need]) => {
            const allowed =
              who === 'SUPER' ||
              need === 'any' ||
              (need !== SUPER_ADMIN_ONLY && perms.has(need));
            const res = await call(m, path, tokens[who].token);
            const denied =
              res.status === 403 &&
              ['PERMISSION_DENIED', 'ROLE_FORBIDDEN'].includes(
                res.body.error?.code,
              );
            if (allowed === denied || res.status === 429 || res.status >= 500)
              failures.push(
                `${who} ${m.toUpperCase()} ${path} → ${res.status} ${res.body.error?.code ?? ''}`,
              );
          }),
        );
      }
    }
    expect(failures).toEqual([]);
  }, 300_000);

  it('refuses non-admin roles and reports the missing permission', async () => {
    const patient = await registerPatient(ctx);
    expect(
      (await call('get', '/admin/requests', patient.access_token).expect(403))
        .body.error.code,
    ).toBe('ROLE_FORBIDDEN');
    expect(
      (await call('get', '/admin/requests', pharmacist.token).expect(403)).body
        .error.code,
    ).toBe('ROLE_FORBIDDEN');
    const res = await call(
      'get',
      '/admin/audit-logs',
      tokens.VERIFICATION_ADMIN.token,
    ).expect(403);
    expect(res.body.error).toMatchObject({
      code: 'PERMISSION_DENIED',
      details: { required: [P.AUDIT_READ] },
    });
    const me = await call(
      'get',
      '/admin/me/permissions',
      tokens.FINANCE_ADMIN.token,
    ).expect(200);
    expect(me.body.data).toMatchObject({
      admin_roles: ['FINANCE_ADMIN'],
      mfa_enabled: true,
    });
    expect(me.body.data.permissions).toEqual(
      [...DEFAULT_ROLE_PERMISSIONS.FINANCE_ADMIN].sort(),
    );
  });

  it('lets the super admin assign sub-roles; removing one revokes the admin’s sessions', async () => {
    const a = await createAdmin([]);
    await call('get', '/admin/audit-logs', a.token).expect(403);
    await ctx
      .http()
      .put(`/admin/users/${a.id}/admin-roles`)
      .set(bearer(tokens.SUPER.token))
      .send({
        roles: ['COMPLIANCE_ADMIN'],
        reason: 'Nouvelle recrue conformité',
      })
      .expect(200);
    await call('get', '/admin/audit-logs', a.token).expect(200);
    await ctx
      .http()
      .put(`/admin/users/${a.id}/admin-roles`)
      .set(bearer(tokens.SUPER.token))
      .send({ roles: [], reason: 'Départ du collaborateur' })
      .expect(200);
    expect(
      (await call('get', '/admin/audit-logs', a.token).expect(401)).body.error
        .code,
    ).toBe('AUTH_SESSION_REVOKED');
    const patient = await registerPatient(ctx);
    expect(
      (
        await ctx
          .http()
          .put(`/admin/users/${patient.user.id}/admin-roles`)
          .set(bearer(tokens.SUPER.token))
          .send({ roles: ['SUPPORT_ADMIN'], reason: 'Erreur de cible' })
          .expect(400)
      ).body.error.code,
    ).toBe('ADMIN_ROLE_TARGET_INVALID');
  });

  describe('sensitive access grants', () => {
    async function requestWithConversation() {
      const p = await registerPatient(ctx);
      const addressId = await createAddress(
        ctx,
        p.access_token,
        area.wilayaId,
        area.id,
      );
      const fileId = await uploadFile(ctx, p.access_token, 'PRESCRIPTION');
      const r = await ctx
        .http()
        .post('/requests')
        .set(bearer(p.access_token))
        .send({
          request_type: 'PRESCRIPTION',
          file_ids: [fileId],
          address_id: addressId,
          delivery_wanted: false,
          consent_to_share: true,
          pharmacy_ids: [ph.pharmacyId],
          items: [{ raw_name: 'Lévothyrox 75', quantity: 1 }],
          patient_note: 'Traitement thyroïde',
        })
        .expect(201);
      const q = await ctx
        .http()
        .post(`/pharmacy/requests/${r.body.data.id}/clarification`)
        .set(bearer(pharmacist.token))
        .send({ question: 'Quelle est la posologie prescrite ?' })
        .expect(200);
      return {
        requestId: r.body.data.id as string,
        fileId,
        conversationId: q.body.data.conversation_id as string,
      };
    }

    it('shows request metadata without prescription content, and content only with an active grant', async () => {
      const support = tokens.SUPPORT_ADMIN.token;
      const r = await requestWithConversation();
      const list = await call(
        'get',
        `/admin/requests?pharmacy_id=${ph.pharmacyId}`,
        support,
      ).expect(200);
      const row = list.body.data.find(
        (x: { id: string }) => x.id === r.requestId,
      );
      expect(row).toMatchObject({ files_count: 1, recipients_count: 1 });
      const text =
        JSON.stringify(list.body) +
        JSON.stringify(
          (
            await call('get', `/admin/requests/${r.requestId}`, support).expect(
              200,
            )
          ).body,
        );
      for (const secret of ['Lévothyrox', 'Traitement thyroïde', r.fileId])
        expect(text).not.toContain(secret);

      // No grant → 403, also for the files and the conversation.
      expect(
        (
          await call(
            'get',
            `/admin/requests/${r.requestId}/content`,
            support,
          ).expect(403)
        ).body.error.code,
      ).toBe('SENSITIVE_ACCESS_GRANT_REQUIRED');
      await ctx
        .http()
        .get(`/files/${r.fileId}/access-url`)
        .set(bearer(support))
        .expect(404);
      expect(
        (
          await call(
            'get',
            `/admin/conversations/${r.conversationId}/messages`,
            support,
          ).expect(403)
        ).body.error.code,
      ).toBe('SENSITIVE_ACCESS_GRANT_REQUIRED');

      // Justification is mandatory.
      await ctx
        .http()
        .post('/admin/sensitive-access')
        .set(bearer(support))
        .send({
          resource_type: 'REQUEST',
          resource_id: r.requestId,
          justification: 'trop court',
        })
        .expect(400);
      const g = await ctx
        .http()
        .post('/admin/sensitive-access')
        .set(bearer(support))
        .send({
          resource_type: 'REQUEST',
          resource_id: r.requestId,
          justification:
            'Litige client : vérifier la conformité de l’ordonnance',
        })
        .expect(201);
      const minutes =
        (new Date(g.body.data.expires_at).getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(29);
      expect(minutes).toBeLessThanOrEqual(30);

      const content = await call(
        'get',
        `/admin/requests/${r.requestId}/content`,
        support,
      ).expect(200);
      expect(content.body.data.items[0].raw_name).toBe('Lévothyrox 75');
      expect(content.body.data.files[0].file_id).toBe(r.fileId);
      await ctx
        .http()
        .get(`/files/${r.fileId}/access-url`)
        .set(bearer(support))
        .expect(200);
      const logs = await ctx.db
        .select()
        .from(sensitiveAccessLogs)
        .where(
          and(
            eq(sensitiveAccessLogs.actorUserId, tokens.SUPPORT_ADMIN.id),
            eq(sensitiveAccessLogs.resourceId, r.requestId),
          ),
        );
      expect(logs.length).toBeGreaterThanOrEqual(2);
      expect(
        logs.every((l) => l.justification?.startsWith('Litige client')),
      ).toBe(true);

      // The grant is personal and resource-bound.
      expect(
        (
          await call(
            'get',
            `/admin/requests/${r.requestId}/content`,
            tokens.COMPLIANCE_ADMIN.token,
          ).expect(403)
        ).body.error.code,
      ).toBe('SENSITIVE_ACCESS_GRANT_REQUIRED');
      await ctx
        .http()
        .get(`/files/${r.fileId}/access-url`)
        .set(bearer(tokens.COMPLIANCE_ADMIN.token))
        .expect(404);
      expect(
        (
          await call(
            'get',
            `/admin/conversations/${r.conversationId}/messages`,
            support,
          ).expect(403)
        ).body.error.code,
      ).toBe('SENSITIVE_ACCESS_GRANT_REQUIRED');
      const other = await requestWithConversation();
      await call(
        'get',
        `/admin/requests/${other.requestId}/content`,
        support,
      ).expect(403);

      // Expired / revoked grants no longer work.
      await ctx.db
        .update(sensitiveAccessGrants)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(sensitiveAccessGrants.id, g.body.data.id));
      await call(
        'get',
        `/admin/requests/${r.requestId}/content`,
        support,
      ).expect(403);
      const g2 = await ctx
        .http()
        .post('/admin/sensitive-access')
        .set(bearer(support))
        .send({
          resource_type: 'CONVERSATION',
          resource_id: r.conversationId,
          justification: 'Signalement de propos abusifs dans la conversation',
        })
        .expect(201);
      const msgs = await call(
        'get',
        `/admin/conversations/${r.conversationId}/messages`,
        support,
      ).expect(200);
      expect(msgs.body.data[0].body).toContain('posologie');
      await ctx
        .http()
        .delete(`/admin/sensitive-access/${g2.body.data.id}`)
        .set(bearer(support))
        .expect(200);
      await call(
        'get',
        `/admin/conversations/${r.conversationId}/messages`,
        support,
      ).expect(403);
      const mine = await call('get', '/admin/sensitive-access', support).expect(
        200,
      );
      expect(mine.body.data.map((x: { id: string }) => x.id)).toEqual(
        expect.arrayContaining([g.body.data.id, g2.body.data.id]),
      );
      // Verification admins cannot open grants at all.
      await ctx
        .http()
        .post('/admin/sensitive-access')
        .set(bearer(tokens.VERIFICATION_ADMIN.token))
        .send({
          resource_type: 'REQUEST',
          resource_id: r.requestId,
          justification: 'Je veux juste regarder cette ordonnance',
        })
        .expect(403);
    });
  });

  it('runs the verification queues: documents via logged signed URLs, approve / reject / request documents', async () => {
    const va = tokens.VERIFICATION_ADMIN.token;
    const pending = await createPharmacy(ctx, {
      wilayaId: area.wilayaId,
      communeId: area.id,
      status: 'DRAFT',
    });
    const fileId = await uploadFile(ctx, pending.ownerToken, 'PHARMACY_DOC');
    await ctx.db.insert(pharmacyDocuments).values({
      pharmacyId: pending.pharmacyId,
      docType: 'AUTHORIZATION',
      fileId,
    });
    await ctx.db
      .update(pharmacies)
      .set({ status: 'PENDING_VERIFICATION', submittedForReviewAt: new Date() })
      .where(eq(pharmacies.id, pending.pharmacyId));
    await ctx.db
      .update(users)
      .set({ status: 'PENDING_VERIFICATION' })
      .where(eq(users.id, pending.ownerId));

    const queue = await call(
      'get',
      '/admin/verification/pharmacies?limit=100&order=desc',
      va,
    ).expect(200);
    expect(queue.body.data.map((p: { id: string }) => p.id)).toContain(
      pending.pharmacyId,
    );
    const detail = await call(
      'get',
      `/admin/verification/pharmacies/${pending.pharmacyId}`,
      va,
    ).expect(200);
    expect(detail.body.data.documents[0]).toMatchObject({
      file_id: fileId,
      review_status: 'PENDING',
    });
    await ctx
      .http()
      .get(`/files/${fileId}/access-url`)
      .set(bearer(va))
      .expect(200);
    await ctx
      .http()
      .get(`/files/${fileId}/access-url`)
      .set(bearer(tokens.FINANCE_ADMIN.token))
      .expect(404);

    expect(
      (
        await ctx
          .http()
          .post(`/admin/verification/pharmacies/${pending.pharmacyId}/reject`)
          .set(bearer(va))
          .send({})
          .expect(400)
      ).body.error.code,
    ).toBe('VALIDATION_FAILED');
    await ctx
      .http()
      .post(
        `/admin/verification/pharmacies/${pending.pharmacyId}/request-documents`,
      )
      .set(bearer(va))
      .send({ reason: 'Autorisation illisible', doc_types: ['AUTHORIZATION'] })
      .expect(200);
    const [back] = await ctx.db
      .select()
      .from(pharmacies)
      .where(eq(pharmacies.id, pending.pharmacyId));
    expect(back).toMatchObject({
      status: 'DRAFT',
      rejectionReason: 'Autorisation illisible',
    });
    await ctx.db
      .update(pharmacies)
      .set({ status: 'PENDING_VERIFICATION' })
      .where(eq(pharmacies.id, pending.pharmacyId));
    const ok = await ctx
      .http()
      .post(`/admin/verification/pharmacies/${pending.pharmacyId}/approve`)
      .set(bearer(va))
      .send({ note: 'Dossier complet' })
      .expect(200);
    expect(ok.body.data).toMatchObject({
      decision: 'APPROVED',
      status: 'VERIFIED',
    });
    const [owner] = await ctx.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, pending.ownerId));
    expect(owner.status).toBe('ACTIVE');
    await waitFor(
      async () =>
        (
          await ctx.db
            .select()
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, pending.ownerId),
                eq(notifications.type, 'VERIFICATION_DECIDED'),
              ),
            )
        ).length,
    );
    await ctx
      .http()
      .post(`/admin/verification/pharmacies/${pending.pharmacyId}/approve`)
      .set(bearer(va))
      .send({})
      .expect(409);

    // Driver approval activates the account.
    const du = await insertUser(ctx, 'DRIVER', {
      status: 'PENDING_VERIFICATION',
    });
    const [d] = await ctx.db
      .insert(drivers)
      .values({
        userId: du.id,
        firstName: 'Nadir',
        lastName: 'Moto',
        vehicleType: 'MOTORCYCLE',
      })
      .returning();
    await ctx
      .http()
      .post(`/admin/verification/drivers/${d.id}/approve`)
      .set(bearer(va))
      .send({})
      .expect(200);
    const driverToken = await login(ctx, du.email!);
    const me = await ctx
      .http()
      .get('/delivery/me')
      .set(bearer(driverToken))
      .expect(200);
    expect(me.body.data).toMatchObject({
      status: 'VERIFIED',
      account_status: 'ACTIVE',
      can_take_jobs: true,
    });
  });

  it('suspends and reactivates users with a reason, revoking sessions and notifying them', async () => {
    const support = tokens.SUPPORT_ADMIN.token;
    const patient = await registerPatient(ctx);
    const view = await call(
      'get',
      `/admin/users/${patient.user.id}`,
      support,
    ).expect(200);
    expect(view.body.data).toMatchObject({
      id: patient.user.id,
      role: 'PATIENT',
    });
    expect(JSON.stringify(view.body.data)).not.toMatch(
      /national_id|date_of_birth|chifa|allerg/i,
    );
    await ctx
      .http()
      .post(`/admin/users/${patient.user.id}/suspend`)
      .set(bearer(support))
      .send({})
      .expect(400);
    await ctx
      .http()
      .post(`/admin/users/${patient.user.id}/suspend`)
      .set(bearer(support))
      .send({ reason: 'Fraude à l’ordonnance signalée' })
      .expect(200);
    expect(
      (
        await ctx
          .http()
          .get('/patients/me')
          .set(bearer(patient.access_token))
          .expect(401)
      ).body.error.code,
    ).toBe('AUTH_SESSION_REVOKED');
    await waitFor(
      async () =>
        (
          await ctx.db
            .select()
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, patient.user.id),
                eq(notifications.type, 'ACCOUNT_STATUS_CHANGED'),
              ),
            )
        ).length,
    );
    const back = await ctx
      .http()
      .post(`/admin/users/${patient.user.id}/reactivate`)
      .set(bearer(support))
      .send({ reason: 'Vérification faite, compte légitime' })
      .expect(200);
    expect(back.body.data.status).toBe('ACTIVE');
    // Admin accounts cannot be suspended by a sub-role admin.
    await ctx
      .http()
      .post(`/admin/users/${tokens.FINANCE_ADMIN.id}/suspend`)
      .set(bearer(support))
      .send({ reason: 'Tentative interdite' })
      .expect(403);
  });

  it('guards eligibility policies, commission rules and settings changes', async () => {
    const compliance = tokens.COMPLIANCE_ADMIN.token;
    const [controlled] = await ctx.db
      .select()
      .from(eligibilityPolicies)
      .where(eq(eligibilityPolicies.appliesToCategory, 'CONTROLLED'));
    const prev = {
      isEnabled: controlled.isEnabled,
      legalBasisReference: controlled.legalBasisReference,
    };
    try {
      await ctx.db
        .update(eligibilityPolicies)
        .set({ legalBasisReference: null, isEnabled: false })
        .where(eq(eligibilityPolicies.id, controlled.id));
      const res = await ctx
        .http()
        .patch(`/admin/eligibility-policies/${controlled.id}`)
        .set(bearer(compliance))
        .send({ is_enabled: true, reason: 'Essai sans base légale' })
        .expect(400);
      expect(res.body.error).toMatchObject({
        code: 'ELIGIBILITY_LEGAL_BASIS_REQUIRED',
        details: { controlled: true },
      });
      await ctx
        .http()
        .patch(`/admin/eligibility-policies/${controlled.id}`)
        .set(bearer(compliance))
        .send({
          requires_pharmacist_validation: false,
          reason: 'Essai interdit',
        })
        .expect(400);
    } finally {
      await ctx.db
        .update(eligibilityPolicies)
        .set(prev)
        .where(eq(eligibilityPolicies.id, controlled.id));
    }

    const finance = tokens.FINANCE_ADMIN.token;
    const rule = await ctx
      .http()
      .post('/admin/commission-rules')
      .set(bearer(finance))
      .send({
        scope: 'PHARMACY',
        pharmacy_id: ph.pharmacyId,
        type: 'PERCENT',
        value: 300,
        legal_review_note: 'Avis juridique AJ-2026-14 (test)',
      })
      .expect(201);
    expect(rule.body.data.is_active).toBe(false);
    await ctx
      .http()
      .post('/admin/commission-rules')
      .set(bearer(finance))
      .send({ scope: 'GLOBAL', type: 'PERCENT', value: 300 })
      .expect(400);
    const on = await ctx
      .http()
      .patch(`/admin/commission-rules/${rule.body.data.id}`)
      .set(bearer(finance))
      .send({ is_active: true, reason: 'Validation direction' })
      .expect(200);
    expect(on.body.data.is_active).toBe(true);
    await ctx
      .http()
      .patch(`/admin/commission-rules/${rule.body.data.id}`)
      .set(bearer(finance))
      .send({ is_active: false, reason: 'Fin du test' })
      .expect(200);

    const sup = tokens.SUPER.token;
    expect(
      (
        await ctx
          .http()
          .patch('/admin/settings/ocr_enabled')
          .set(bearer(sup))
          .send({ value: 'yes', reason: 'Mauvais type' })
          .expect(400)
      ).body.error.code,
    ).toBe('SETTING_VALUE_INVALID');
    expect(
      (
        await ctx
          .http()
          .patch('/admin/settings/payment_collection_model')
          .set(bearer(sup))
          .send({ value: 'CASH', reason: 'Valeur inconnue' })
          .expect(400)
      ).body.error.code,
    ).toBe('SETTING_VALUE_INVALID');
    await ctx
      .http()
      .patch('/admin/settings/message_max_length')
      .set(bearer(sup))
      .send({ value: 1800, reason: 'Réduction anti-spam' })
      .expect(200);
    await ctx
      .http()
      .patch('/admin/settings/message_max_length')
      .set(bearer(sup))
      .send({ value: 2000, reason: 'Retour à la valeur par défaut' })
      .expect(200);
    const history = await call(
      'get',
      '/admin/settings/message_max_length/history',
      sup,
    ).expect(200);
    expect(
      history.body.data
        .slice(0, 2)
        .map((h: { new_value: number }) => h.new_value),
    ).toEqual([2000, 1800]);
    expect(
      await ctx.db
        .select()
        .from(platformSettingChanges)
        .where(eq(platformSettingChanges.key, 'message_max_length')),
    ).not.toHaveLength(0);
  });

  it('validates notification template overrides and exports the audit trail', async () => {
    const sup = tokens.SUPER.token;
    const bad = await ctx
      .http()
      .put('/admin/notification-templates/DELIVERY_CODE/fr')
      .set(bearer(sup))
      .send({
        title: 'Code',
        body: 'Code {code} pour {medicine_name}',
        reason: 'Tentative de fuite',
      })
      .expect(400);
    expect(bad.body.error).toMatchObject({
      code: 'NOTIFICATION_TEMPLATE_INVALID',
      details: { unknown_placeholders: ['medicine_name'] },
    });
    await ctx
      .http()
      .put('/admin/notification-templates/ACCOUNT_STATUS_CHANGED/fr')
      .set(bearer(sup))
      .send({
        title: 'Compte DEWA',
        body: 'Nouveau statut : {status_label}.',
        reason: 'Harmonisation des textes',
      })
      .expect(200);
    const patient = await registerPatient(ctx);
    await ctx
      .http()
      .post(`/admin/users/${patient.user.id}/suspend`)
      .set(bearer(tokens.SUPPORT_ADMIN.token))
      .send({ reason: 'Test du modèle de notification' })
      .expect(200);
    await ctx
      .http()
      .post(`/admin/users/${patient.user.id}/reactivate`)
      .set(bearer(tokens.SUPPORT_ADMIN.token))
      .send({ reason: 'Fin du test du modèle' })
      .expect(200);
    const token = await login(ctx, patient.phone);
    const list = await waitFor(async () => {
      const r = await ctx.http().get('/notifications').set(bearer(token));
      return r.body.data?.find(
        (n: { type: string }) => n.type === 'ACCOUNT_STATUS_CHANGED',
      );
    });
    expect(list.title).toBe('Compte DEWA');
    expect(list.body).toMatch(/^Nouveau statut : /);
    await ctx
      .http()
      .delete('/admin/notification-templates/ACCOUNT_STATUS_CHANGED/fr')
      .set(bearer(sup))
      .expect(200);

    const csv = await ctx
      .http()
      .get('/admin/audit-logs/export?action=USER_STATUS_CHANGED')
      .set(bearer(tokens.COMPLIANCE_ADMIN.token))
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('"USER_STATUS_CHANGED"');
    expect(csv.text.split('\n')[0]).toContain('id,created_at,actor_user_id');
    const sec = await call(
      'get',
      '/admin/security-events',
      tokens.COMPLIANCE_ADMIN.token,
    ).expect(200);
    expect(sec.body.meta.last_24h).toHaveProperty('failed_logins');
    const overview = await call(
      'get',
      `/admin/analytics/overview?wilaya_id=${area.wilayaId}`,
      tokens.FINANCE_ADMIN.token,
    ).expect(200);
    expect(overview.body.data).toHaveProperty('requests.total');
    expect(overview.body.data).toHaveProperty('delivery.success_rate');
    expect(overview.body.data.by_date.length).toBe(30);
  });

  it('requires MFA codes for admin login (no admin session without TOTP)', async () => {
    const u = await insertUser(ctx, 'ADMIN');
    const res = await ctx
      .http()
      .post('/auth/login')
      .send({ identifier: u.email, password: 'Str0ngPassw0rd' })
      .expect(200);
    expect(res.body.data).not.toHaveProperty('access_token');
    expect(res.body.data.mfa_token).toBeDefined();
    expect(typeof authenticator.generate).toBe('function');
  });
});
