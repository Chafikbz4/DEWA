import { and, eq } from 'drizzle-orm';
import {
  requestRecipients,
  requests,
  sensitiveAccessLogs,
} from '../src/database/schema';
import { EICAR_TEST_STRING } from '../src/modules/files/scanning/malware-scanner';
import { RequestsService } from '../src/modules/requests/requests.service';
import {
  addStaff,
  bearer,
  createAddress,
  createMedicine,
  createPharmacy,
  createTestApp,
  drainJobs,
  enablePolicy,
  isolatedCommune,
  PharmacyFixture,
  PNG,
  registerPatient,
  TestCtx,
  uploadFile,
} from './utils';

describe('Patient domain (e2e)', () => {
  let ctx: TestCtx;
  let area: { id: number; wilayaId: number };
  let open1: PharmacyFixture;
  let open2: PharmacyFixture;
  let closed: PharmacyFixture;
  let draft: PharmacyFixture;

  beforeAll(async () => {
    ctx = await createTestApp();
    area = await isolatedCommune(ctx);
    await enablePolicy(ctx, 'PRESCRIPTION');
    open1 = await createPharmacy(ctx, {
      wilayaId: area.wilayaId,
      communeId: area.id,
      lat: 36.751,
      lng: 3.051,
    });
    open2 = await createPharmacy(ctx, {
      wilayaId: area.wilayaId,
      communeId: area.id,
      lat: 36.76,
      lng: 3.06,
      delivery: true,
    });
    closed = await createPharmacy(ctx, {
      wilayaId: area.wilayaId,
      communeId: area.id,
      open: false,
    });
    draft = await createPharmacy(ctx, {
      wilayaId: area.wilayaId,
      communeId: area.id,
      status: 'DRAFT',
    });
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  async function patientWithAddress() {
    const p = await registerPatient(ctx);
    const addressId = await createAddress(
      ctx,
      p.access_token,
      area.wilayaId,
      area.id,
    );
    return { ...p, addressId };
  }

  async function submitPrescription(
    token: string,
    addressId: string,
    extra: Record<string, unknown> = {},
  ) {
    const fileId = await uploadFile(ctx, token, 'PRESCRIPTION');
    const res = await ctx
      .http()
      .post('/requests')
      .set(bearer(token))
      .send({
        request_type: 'PRESCRIPTION',
        file_ids: [fileId],
        address_id: addressId,
        delivery_wanted: false,
        consent_to_share: true,
        ...extra,
      });
    return { res, fileId };
  }

  describe('reference data & nearby', () => {
    it('lists wilayas and communes publicly', async () => {
      const w = await ctx.http().get('/geo/wilayas').expect(200);
      expect(w.body.meta.pagination.total).toBe(58);
      expect(w.body.data[15]).toMatchObject({ id: 16, name_fr: 'Alger' });
      const c = await ctx
        .http()
        .get(`/geo/wilayas/${area.wilayaId}/communes`)
        .expect(200);
      expect(
        c.body.data.every(
          (x: { wilaya_id: number }) => x.wilaya_id === area.wilayaId,
        ),
      ).toBe(true);
      await ctx.http().get('/geo/wilayas/99/communes').expect(404);
    });

    it('returns nearby verified pharmacies with public fields only', async () => {
      const res = await ctx
        .http()
        .get('/pharmacies/nearby?lat=36.751&lng=3.051&radius=3&open_now=true')
        .expect(200);
      const ids = res.body.data.map((p: { id: string }) => p.id);
      expect(ids).toContain(open1.pharmacyId);
      expect(ids).not.toContain(closed.pharmacyId);
      expect(ids).not.toContain(draft.pharmacyId);
      const first = res.body.data.find(
        (p: { id: string }) => p.id === open1.pharmacyId,
      );
      expect(first).toMatchObject({
        open_now: true,
        delivery_available: false,
      });
      expect(first.distance_m).toBeLessThan(200);
      expect(Object.keys(first)).not.toEqual(
        expect.arrayContaining(['authorization_number', 'tax_id_nif', 'email']),
      );
    });
  });

  describe('addresses & dependants', () => {
    it('validates wilaya/commune, manages the default and soft-deletes', async () => {
      const { access_token: t } = await registerPatient(ctx);
      const bad = await ctx
        .http()
        .post('/patients/me/addresses')
        .set(bearer(t))
        .send({
          wilaya_id: area.wilayaId === 1 ? 2 : 1,
          commune_id: area.id,
          street_line: 'Nowhere',
        })
        .expect(400);
      expect(bad.body.error.code).toBe('GEO_INVALID_COMMUNE');

      const a1 = await createAddress(ctx, t, area.wilayaId, area.id);
      const a2 = await createAddress(ctx, t, area.wilayaId, area.id);
      let list = await ctx
        .http()
        .get('/patients/me/addresses')
        .set(bearer(t))
        .expect(200);
      expect(list.body.data[0]).toMatchObject({ id: a1, is_default: true });

      await ctx
        .http()
        .post(`/patients/me/addresses/${a2}/default`)
        .set(bearer(t))
        .expect(200);
      await ctx
        .http()
        .delete(`/patients/me/addresses/${a2}`)
        .set(bearer(t))
        .expect(200);
      list = await ctx
        .http()
        .get('/patients/me/addresses')
        .set(bearer(t))
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({ id: a1, is_default: true });
    });

    it('stores the national id encrypted and returns it masked', async () => {
      const { access_token: t } = await registerPatient(ctx);
      const res = await ctx
        .http()
        .patch('/patients/me')
        .set(bearer(t))
        .send({ national_id: '109900123456789012', gender: 'FEMALE' })
        .expect(200);
      expect(res.body.data.national_id_masked).toBe('**************9012');
      expect(JSON.stringify(res.body)).not.toContain('109900123456789012');
    });

    it('only allows requests for allowed relationships', async () => {
      const p = await patientWithAddress();
      const parent = await ctx
        .http()
        .post('/patients/me/dependants')
        .set(bearer(p.access_token))
        .send({ first_name: 'Ali', last_name: 'B', relationship: 'PARENT' })
        .expect(201);
      expect(parent.body.data).toMatchObject({
        authorization_status: 'DECLARED',
        can_request_for: true,
      });
      const other = await ctx
        .http()
        .post('/patients/me/dependants')
        .set(bearer(p.access_token))
        .send({ first_name: 'Voisin', last_name: 'X', relationship: 'OTHER' })
        .expect(201);
      expect(other.body.data.can_request_for).toBe(false);

      const { res } = await submitPrescription(p.access_token, p.addressId, {
        dependant_id: other.body.data.id,
      });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('DEPENDANT_RELATIONSHIP_NOT_ALLOWED');
      const ok = await submitPrescription(p.access_token, p.addressId, {
        dependant_id: parent.body.data.id,
      });
      expect(ok.res.status).toBe(201);
      expect(ok.res.body.data.dependant_first_name).toBe('Ali');
    });
  });

  describe('files', () => {
    it('accepts JPEG/PNG/PDF by magic bytes and rejects other or infected content', async () => {
      const { access_token: t } = await registerPatient(ctx);
      const pdf = Buffer.from(
        '%PDF-1.4\n%âãÏÓ\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF',
      );
      const ok = await ctx
        .http()
        .post('/files/upload')
        .set(bearer(t))
        .field('purpose', 'PRESCRIPTION')
        .attach('files', PNG, 'a.png')
        .attach('files', pdf, 'b.pdf')
        .expect(201);
      expect(
        ok.body.data.map((f: { mime_type: string }) => f.mime_type),
      ).toEqual(['image/png', 'application/pdf']);
      expect(ok.body.data[0].sha256).toMatch(/^[a-f0-9]{64}$/);

      const fake = await ctx
        .http()
        .post('/files/upload')
        .set(bearer(t))
        .field('purpose', 'PRESCRIPTION')
        .attach('files', Buffer.from('not really a png'), 'evil.png')
        .expect(415);
      expect(fake.body.error.code).toBe('FILE_TYPE_NOT_ALLOWED');

      const infected = await ctx
        .http()
        .post('/files/upload')
        .set(bearer(t))
        .field('purpose', 'PRESCRIPTION')
        .attach(
          'files',
          Buffer.concat([PNG, Buffer.from(EICAR_TEST_STRING)]),
          'x.png',
        )
        .expect(422);
      expect(infected.body.error.code).toBe('FILE_INFECTED');

      const purpose = await ctx
        .http()
        .post('/files/upload')
        .set(bearer(t))
        .field('purpose', 'PHARMACY_DOC')
        .attach('files', PNG, 'a.png')
        .expect(403);
      expect(purpose.body.error.code).toBe('FILE_PURPOSE_NOT_ALLOWED');
    });

    it('serves files only through short-lived signed links to authorized users', async () => {
      const owner = await registerPatient(ctx);
      const other = await registerPatient(ctx);
      const fileId = await uploadFile(ctx, owner.access_token, 'PRESCRIPTION');

      const link = await ctx
        .http()
        .get(`/files/${fileId}/access-url`)
        .set(bearer(owner.access_token))
        .expect(200);
      const path = new URL(link.body.data.url).pathname;
      const dl = await ctx
        .http()
        .get(path)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(dl.headers['content-type']).toBe('image/png');
      expect(dl.headers['cache-control']).toContain('no-store');
      expect(Buffer.compare(dl.body as Buffer, PNG)).toBe(0);

      const denied = await ctx
        .http()
        .get(`/files/${fileId}/access-url`)
        .set(bearer(other.access_token))
        .expect(404);
      expect(denied.body.error.code).toBe('FILE_NOT_FOUND');

      const tampered =
        path.slice(0, -4) + (path.endsWith('aaaa') ? 'bbbb' : 'aaaa');
      expect((await ctx.http().get(tampered).expect(403)).body.error.code).toBe(
        'FILE_URL_INVALID',
      );
    });

    it('lets recipient pharmacists/owners read the prescription (logged), not assistants or other pharmacies, and stops on consent revocation', async () => {
      const p = await patientWithAddress();
      const { res, fileId } = await submitPrescription(
        p.access_token,
        p.addressId,
        { pharmacy_ids: [open1.pharmacyId] },
      );
      expect(res.status).toBe(201);

      const pharmacist = await addStaff(ctx, open1.pharmacyId, 'PHARMACIST');
      const assistant = await addStaff(ctx, open1.pharmacyId, 'ASSISTANT');

      await ctx
        .http()
        .get(`/files/${fileId}/access-url`)
        .set(bearer(open1.ownerToken))
        .expect(200);
      await ctx
        .http()
        .get(`/files/${fileId}/access-url`)
        .set(bearer(pharmacist.token))
        .expect(200);
      await ctx
        .http()
        .get(`/files/${fileId}/access-url`)
        .set(bearer(assistant.token))
        .expect(404);
      await ctx
        .http()
        .get(`/files/${fileId}/access-url`)
        .set(bearer(open2.ownerToken))
        .expect(404);

      const logs = await ctx.db
        .select()
        .from(sensitiveAccessLogs)
        .where(
          and(
            eq(sensitiveAccessLogs.resourceId, res.body.data.id),
            eq(sensitiveAccessLogs.resourceType, 'PRESCRIPTION'),
          ),
        );
      expect(logs.map((l) => l.actorUserId).sort()).toEqual(
        [open1.ownerId, pharmacist.userId].sort(),
      );

      await ctx
        .http()
        .delete('/me/consents/SHARE_PRESCRIPTION_WITH_PHARMACY')
        .set(bearer(p.access_token))
        .expect(200);
      await ctx
        .http()
        .get(`/files/${fileId}/access-url`)
        .set(bearer(pharmacist.token))
        .expect(404);
    });
  });

  describe('matching & submission', () => {
    it('previews automatic matching: verified + accepting + covering + open, closest first', async () => {
      const p = await patientWithAddress();
      const res = await ctx
        .http()
        .post('/requests/preview-matching')
        .set(bearer(p.access_token))
        .send({ address_id: p.addressId, delivery_wanted: false })
        .expect(200);
      expect(res.body.data.mode).toBe('AUTOMATIC');
      const ids = res.body.data.pharmacies.map((x: { id: string }) => x.id);
      expect(ids).toEqual([open1.pharmacyId, open2.pharmacyId]);

      const delivery = await ctx
        .http()
        .post('/requests/preview-matching')
        .set(bearer(p.access_token))
        .send({ address_id: p.addressId, delivery_wanted: true })
        .expect(200);
      expect(
        delivery.body.data.pharmacies.map((x: { id: string }) => x.id),
      ).toEqual([open2.pharmacyId]);

      const chosen = await ctx
        .http()
        .post('/requests/preview-matching')
        .set(bearer(p.access_token))
        .send({
          address_id: p.addressId,
          delivery_wanted: false,
          pharmacy_ids: [draft.pharmacyId],
        })
        .expect(422);
      expect(chosen.body.error).toMatchObject({
        code: 'REQUEST_PHARMACY_NOT_ELIGIBLE',
        details: { pharmacy_ids: [draft.pharmacyId] },
      });
    });

    it('creates a prescription request with reference, recipients and advisory OCR items', async () => {
      const p = await patientWithAddress();
      const { res } = await submitPrescription(p.access_token, p.addressId, {
        patient_note: 'Générique OK',
        urgency: 'URGENT',
      });
      expect(res.status).toBe(201);
      const r = res.body.data;
      expect(r.reference).toMatch(/^RX-\d{4}-\d{6}$/);
      expect(r).toMatchObject({
        status: 'AWAITING_PHARMACY_RESPONSE',
        urgency: 'URGENT',
        prescription_submitted: true,
        chifa_info_submitted: false,
        coverage_verified: { verified: false, source: null },
        recipients_count: 2,
      });
      expect(r.delivery_address).toMatchObject({ commune_id: area.id });

      await drainJobs(ctx);
      const after = await ctx
        .http()
        .get(`/requests/${r.id}`)
        .set(bearer(p.access_token))
        .expect(200);
      const ocr = after.body.data.items.filter(
        (i: { source: string }) => i.source === 'OCR',
      );
      expect(ocr.length).toBeGreaterThan(0);
      expect(ocr[0]).toMatchObject({ confirmed_by_pharmacist: false });
      expect(after.body.data.status).toBe('AWAITING_PHARMACY_RESPONSE');

      // The patient can correct an OCR suggestion.
      const edited = await ctx
        .http()
        .patch(`/requests/${r.id}/items/${ocr[0].id}`)
        .set(bearer(p.access_token))
        .send({ raw_name: 'Paracetamol 500mg', quantity: 2 })
        .expect(200);
      expect(
        edited.body.data.items.find((i: { id: string }) => i.id === ocr[0].id),
      ).toMatchObject({ source: 'PATIENT', quantity: 2 });
    });

    it('requires the share consent', async () => {
      const p = await patientWithAddress();
      const { res } = await submitPrescription(p.access_token, p.addressId, {
        consent_to_share: false,
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('REQUEST_CONSENT_REQUIRED');
    });

    it('rejects restricted categories and disallowed delivery with specific codes', async () => {
      const p = await patientWithAddress();
      const controlled = await createMedicine(ctx, 'CONTROLLED', 'Morphine');
      const { res } = await submitPrescription(p.access_token, p.addressId, {
        items: [{ raw_name: 'Morphine', medicine_id: controlled }],
      });
      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({
        code: 'REQUEST_CATEGORY_RESTRICTED',
        details: { categories: ['CONTROLLED'] },
      });

      const delivery = await submitPrescription(p.access_token, p.addressId, {
        delivery_wanted: true,
      });
      expect(delivery.res.status).toBe(422);
      expect(delivery.res.body.error.code).toBe('REQUEST_DELIVERY_NOT_ALLOWED');

      const otc = await createMedicine(ctx, 'OTC', 'Vitamine C');
      const product = await ctx
        .http()
        .post('/requests')
        .set(bearer(p.access_token))
        .send({
          request_type: 'PRODUCT',
          address_id: p.addressId,
          delivery_wanted: false,
          consent_to_share: true,
          items: [{ raw_name: 'Vitamine C', medicine_id: otc }],
        })
        .expect(422);
      expect(product.body.error.details.categories).toEqual(['OTC']);
    });

    it('refuses to reuse a file already attached to another request', async () => {
      const p = await patientWithAddress();
      const { res, fileId } = await submitPrescription(
        p.access_token,
        p.addressId,
      );
      expect(res.status).toBe(201);
      const again = await ctx
        .http()
        .post('/requests')
        .set(bearer(p.access_token))
        .send({
          request_type: 'PRESCRIPTION',
          file_ids: [fileId],
          address_id: p.addressId,
          delivery_wanted: false,
          consent_to_share: true,
        })
        .expect(400);
      expect(again.body.error.code).toBe('FILE_INVALID_FOR_USE');
    });

    it('stores CHIFA data but never reports coverage as verified without an official source', async () => {
      const p = await patientWithAddress();
      const card = await uploadFile(ctx, p.access_token, 'CHIFA_CARD');
      const missing = await submitPrescription(p.access_token, p.addressId, {
        request_type: 'CHIFA',
      });
      expect(missing.res.body.error.code).toBe('CHIFA_DATA_REQUIRED');

      const { res } = await submitPrescription(p.access_token, p.addressId, {
        request_type: 'CHIFA',
        card_file_id: card,
        insurance_number: '123456789012',
        holder_name: 'Benali Amina',
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        request_type: 'CHIFA',
        prescription_submitted: true,
        chifa_info_submitted: true,
        coverage_verified: {
          verified: false,
          source: null,
          status: 'NOT_VERIFIED',
        },
      });
      expect(JSON.stringify(res.body)).not.toContain('123456789012');
    });
  });

  describe('ownership, cancel, expiry', () => {
    it('hides other patients’ requests and blocks non-patients', async () => {
      const a = await patientWithAddress();
      const b = await registerPatient(ctx);
      const { res } = await submitPrescription(a.access_token, a.addressId);
      const id = res.body.data.id;
      expect(
        (
          await ctx
            .http()
            .get(`/requests/${id}`)
            .set(bearer(b.access_token))
            .expect(404)
        ).body.error.code,
      ).toBe('REQUEST_NOT_FOUND');
      await ctx
        .http()
        .post(`/requests/${id}/cancel`)
        .set(bearer(b.access_token))
        .send({})
        .expect(404);
      expect(
        (
          await ctx
            .http()
            .get('/requests')
            .set(bearer(open1.ownerToken))
            .expect(403)
        ).body.error.code,
      ).toBe('ROLE_FORBIDDEN');

      const mine = await ctx
        .http()
        .get('/requests?status=AWAITING_PHARMACY_RESPONSE')
        .set(bearer(a.access_token))
        .expect(200);
      expect(mine.body.data.map((r: { id: string }) => r.id)).toContain(id);
    });

    it('cancels an open request (recipients expire) and refuses a second cancel', async () => {
      const p = await patientWithAddress();
      const { res } = await submitPrescription(p.access_token, p.addressId);
      const id = res.body.data.id;
      const cancelled = await ctx
        .http()
        .post(`/requests/${id}/cancel`)
        .set(bearer(p.access_token))
        .send({ reason: 'Trouvé ailleurs' })
        .expect(200);
      expect(cancelled.body.data).toMatchObject({
        status: 'CANCELLED',
        cancel_reason: 'Trouvé ailleurs',
      });
      expect(
        cancelled.body.data.recipients.every(
          (r: { status: string }) => r.status === 'EXPIRED',
        ),
      ).toBe(true);
      expect(
        (
          await ctx
            .http()
            .post(`/requests/${id}/cancel`)
            .set(bearer(p.access_token))
            .send({})
            .expect(409)
        ).body.error.code,
      ).toBe('REQUEST_NOT_CANCELLABLE');
    });

    it('expires requests past their deadline', async () => {
      const p = await patientWithAddress();
      const { res } = await submitPrescription(p.access_token, p.addressId);
      const id = res.body.data.id;
      await ctx.db
        .update(requests)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(requests.id, id));
      expect(
        await ctx.app.get(RequestsService).expireDue(),
      ).toBeGreaterThanOrEqual(1);
      const [row] = await ctx.db
        .select({ status: requests.status })
        .from(requests)
        .where(eq(requests.id, id));
      expect(row.status).toBe('EXPIRED');
      const recips = await ctx.db
        .select({ s: requestRecipients.status })
        .from(requestRecipients)
        .where(eq(requestRecipients.requestId, id));
      expect(recips.every((r) => r.s === 'EXPIRED')).toBe(true);
    });
  });
});
