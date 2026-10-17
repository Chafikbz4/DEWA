import { and, eq } from 'drizzle-orm';
import {
  addresses,
  auditLogs,
  dataRetentionJobs,
  files,
  ocrResults,
  orders,
  patientProfiles,
  requestFiles,
  requests,
  users,
} from '../src/database/schema';
import { RetentionService } from '../src/modules/privacy/retention.service';
import {
  addStaff,
  bearer,
  createAddress,
  createPharmacy,
  createTestApp,
  enablePolicy,
  isolatedCommune,
  PASSWORD,
  PharmacyFixture,
  registerPatient,
  TestCtx,
  uploadFile,
} from './utils';

describe('Privacy, retention and production probes (e2e)', () => {
  let ctx: TestCtx;
  let area: { id: number; wilayaId: number };
  let ph: PharmacyFixture;
  let pharmacist: { userId: string; token: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    area = await isolatedCommune(ctx);
    await enablePolicy(ctx, 'PRESCRIPTION');
    ph = await createPharmacy(ctx, {
      wilayaId: area.wilayaId,
      communeId: area.id,
    });
    pharmacist = await addStaff(ctx, ph.pharmacyId, 'PHARMACIST');
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  async function patientWithRequest() {
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
        items: [{ raw_name: 'Kardegic 75', quantity: 1 }],
        patient_note: 'Allergie pénicilline',
      })
      .expect(201);
    return {
      patient: p,
      fileId,
      requestId: r.body.data.id as string,
      request: r.body.data,
    };
  }

  it('exports all personal data without secrets, at most every 10 minutes', async () => {
    const { patient, requestId } = await patientWithRequest();
    const res = await ctx
      .http()
      .post('/me/data-export')
      .set(bearer(patient.access_token))
      .buffer(true)
      .parse((r, cb) => {
        const c: Buffer[] = [];
        r.on('data', (d: Buffer) => c.push(d));
        r.on('end', () => cb(null, Buffer.concat(c)));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="dewa-data-/,
    );
    const data = JSON.parse((res.body as Buffer).toString('utf8'));
    expect(data.account).toMatchObject({
      id: patient.user.id,
      role: 'PATIENT',
    });
    expect(
      data.requests.find((r: { id: string }) => r.id === requestId).items[0]
        .raw_name,
    ).toBe('Kardegic 75');
    expect(data.addresses).toHaveLength(1);
    const text = JSON.stringify(data);
    for (const secret of [
      'password_hash',
      'mfa_secret',
      'storage_key',
      'token_hash',
      '_encrypted',
    ])
      expect(text).not.toContain(secret);
    expect(
      (
        await ctx
          .http()
          .post('/me/data-export')
          .set(bearer(patient.access_token))
          .expect(429)
      ).body.error.code,
    ).toBe('DATA_EXPORT_TOO_FREQUENT');
  });

  it('deletes a patient account by anonymisation, keeping legal records', async () => {
    const { patient, fileId, requestId, request } = await patientWithRequest();
    // An accepted order (in progress) blocks deletion.
    const offer = await ctx
      .http()
      .post(`/pharmacy/requests/${requestId}/offers`)
      .set(bearer(pharmacist.token))
      .send({
        items: [
          {
            request_item_id: request.items[0].id,
            name: 'Kardegic 75',
            quantity_offered: 1,
            unit_price_centimes: 30000,
            availability: 'AVAILABLE',
          },
        ],
        delivery_available: false,
      })
      .expect(201);
    await ctx
      .http()
      .post(`/pharmacy/offers/${offer.body.data.id}/send`)
      .set(bearer(pharmacist.token))
      .expect(200);
    const order = (
      await ctx
        .http()
        .post(`/offers/${offer.body.data.id}/accept`)
        .set(bearer(patient.access_token))
        .send({ fulfillment_type: 'PICKUP' })
        .expect(201)
    ).body.data;

    await ctx
      .http()
      .post('/me/delete-account')
      .set(bearer(patient.access_token))
      .send({ password: 'wrong-password', confirm: true })
      .expect(401);
    await ctx
      .http()
      .post('/me/delete-account')
      .set(bearer(patient.access_token))
      .send({ password: PASSWORD })
      .expect(400);
    const blocked = await ctx
      .http()
      .post('/me/delete-account')
      .set(bearer(patient.access_token))
      .send({ password: PASSWORD, confirm: true })
      .expect(409);
    expect(blocked.body.error).toMatchObject({
      code: 'ACCOUNT_DELETION_BLOCKED',
      details: { active_orders: [order.reference] },
    });

    await ctx
      .http()
      .post(`/orders/${order.id}/cancel`)
      .set(bearer(patient.access_token))
      .send({ reason: 'Je ne souhaite plus' })
      .expect(200);
    const done = await ctx
      .http()
      .post('/me/delete-account')
      .set(bearer(patient.access_token))
      .send({ password: PASSWORD, confirm: true })
      .expect(200);
    expect(done.body.data).toMatchObject({ deleted: true });

    const [u] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.id, patient.user.id));
    expect(u).toMatchObject({
      status: 'DELETED',
      phone: null,
      mfaEnabled: false,
    });
    expect(u.email).toBe(`deleted+${u.id}@deleted.invalid`);
    expect(u.deletedAt).not.toBeNull();
    const [profile] = await ctx.db
      .select()
      .from(patientProfiles)
      .where(eq(patientProfiles.userId, u.id));
    expect(profile).toMatchObject({
      firstName: 'Utilisateur',
      lastName: 'supprimé',
      nationalIdEncrypted: null,
    });
    const [addr] = await ctx.db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, u.id));
    expect(addr).toMatchObject({ streetLine: '-', phoneContact: null });
    expect(addr.deletedAt).not.toBeNull();
    const [f] = await ctx.db.select().from(files).where(eq(files.id, fileId));
    expect(f.deletedAt).not.toBeNull();
    const [r] = await ctx.db
      .select()
      .from(requests)
      .where(eq(requests.id, requestId));
    expect(r.patientNote).toBeNull();
    // The order (legal record) survives without contact details.
    const [o] = await ctx.db
      .select()
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(o).toBeDefined();
    expect(o.status).toBe('CANCELLED');
    // Sessions are gone and the account cannot log in again.
    expect(
      (
        await ctx
          .http()
          .get('/me')
          .set(bearer(patient.access_token))
          .expect(401)
      ).body.error.code,
    ).toBe('AUTH_SESSION_REVOKED');
    await ctx
      .http()
      .post('/auth/login')
      .send({ identifier: patient.phone, password: PASSWORD })
      .expect(401);
    const [log] = await ctx.db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.actorUserId, u.id),
          eq(auditLogs.action, 'ACCOUNT_DELETED'),
        ),
      );
    expect(log).toBeDefined();
  });

  it('securely deletes prescriptions and OCR text after retention, except for active orders', async () => {
    const expired = await patientWithRequest();
    const kept = await patientWithRequest();
    const past = new Date(Date.now() - 86_400_000);
    await ctx.db
      .update(files)
      .set({ retentionUntil: past })
      .where(eq(files.id, expired.fileId));
    await ctx.db
      .update(files)
      .set({ retentionUntil: past })
      .where(eq(files.id, kept.fileId));
    // `kept` has an order in progress → its prescription must survive.
    const offer = await ctx
      .http()
      .post(`/pharmacy/requests/${kept.requestId}/offers`)
      .set(bearer(pharmacist.token))
      .send({
        items: [
          {
            request_item_id: kept.request.items[0].id,
            name: 'Kardegic 75',
            quantity_offered: 1,
            unit_price_centimes: 30000,
            availability: 'AVAILABLE',
          },
        ],
        delivery_available: false,
      })
      .expect(201);
    await ctx
      .http()
      .post(`/pharmacy/offers/${offer.body.data.id}/send`)
      .set(bearer(pharmacist.token))
      .expect(200);
    await ctx
      .http()
      .post(`/offers/${offer.body.data.id}/accept`)
      .set(bearer(kept.patient.access_token))
      .send({ fulfillment_type: 'PICKUP' })
      .expect(201);

    const [rf] = await ctx.db
      .select()
      .from(requestFiles)
      .where(eq(requestFiles.fileId, expired.fileId));
    const [ocr] = await ctx.db
      .insert(ocrResults)
      .values({
        requestFileId: rf.id,
        provider: 'e2e',
        rawTextEncrypted: 'v1:x:y:z',
        extractedJson: { a: 1 },
        status: 'COMPLETED',
      })
      .returning();
    await ctx.db
      .update(ocrResults)
      .set({ createdAt: new Date(Date.now() - 400 * 86_400_000) })
      .where(eq(ocrResults.id, ocr.id));

    const r = await ctx.app.get(RetentionService).runAll();
    expect(r.sensitive_files).toBeGreaterThanOrEqual(1);
    expect(r.ocr_text).toBeGreaterThanOrEqual(1);
    expect(
      (await ctx.db.select().from(files).where(eq(files.id, expired.fileId)))[0]
        .deletedAt,
    ).not.toBeNull();
    expect(
      (await ctx.db.select().from(files).where(eq(files.id, kept.fileId)))[0]
        .deletedAt,
    ).toBeNull();
    expect(
      (
        await ctx.db.select().from(ocrResults).where(eq(ocrResults.id, ocr.id))
      )[0],
    ).toMatchObject({ rawTextEncrypted: null, extractedJson: null });
    const jobs = await ctx.db
      .select()
      .from(dataRetentionJobs)
      .where(eq(dataRetentionJobs.resourceType, 'sensitive_files'));
    expect(jobs.some((j) => j.status === 'SUCCEEDED')).toBe(true);
    // The patient no longer gets a URL for the deleted file.
    await ctx
      .http()
      .get(`/files/${expired.fileId}/access-url`)
      .set(bearer(expired.patient.access_token))
      .expect(404);
  });

  it('exposes liveness, readiness and token-protected metrics', async () => {
    expect(
      (await ctx.http().get('/health/live').expect(200)).body.data.status,
    ).toBe('ok');
    const ready = await ctx.http().get('/ready').expect(200);
    expect(ready.body.data).toMatchObject({ status: 'ready', database: 'up' });
    expect(ready.body.data.migrations_applied).toBeGreaterThanOrEqual(13);
    await ctx.http().get('/metrics').expect(404);
    const res = await ctx
      .http()
      .get('/x-request-id-check')
      .set('X-Request-Id', 'e2e-trace-0001');
    expect(res.headers['x-request-id']).toBe('e2e-trace-0001');
    expect(res.body.meta.request_id).toBe('e2e-trace-0001');
  });
});
