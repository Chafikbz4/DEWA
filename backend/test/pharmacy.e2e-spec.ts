import { and, eq } from 'drizzle-orm';
import {
  conversations,
  deliveryFeeRules,
  deliveryZones,
  pharmacies,
  platformSettings,
  requestRecipients,
  requests,
  sensitiveAccessLogs,
  users,
} from '../src/database/schema';
import { SettingsService } from '../src/modules/settings/settings.service';
import {
  addStaff,
  bearer,
  CONSENTS,
  createAddress,
  createMedicine,
  createPharmacy,
  createTestApp,
  enablePolicy,
  isolatedCommune,
  lastOtp,
  PASSWORD,
  PharmacyFixture,
  registerPatient,
  TestCtx,
  uniquePhone,
  uploadFile,
} from './utils';

describe('Pharmacy domain (e2e)', () => {
  let ctx: TestCtx;
  let area: { id: number; wilayaId: number };
  let ph: PharmacyFixture;
  let pharmacist: { userId: string; token: string };
  let assistant: { userId: string; token: string };

  const setSetting = async (key: string, value: unknown) => {
    await ctx.db
      .update(platformSettings)
      .set({ value })
      .where(eq(platformSettings.key, key));
    ctx.app.get(SettingsService).invalidate();
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    area = await isolatedCommune(ctx);
    await enablePolicy(ctx, 'PRESCRIPTION', { delivery: true });
    await setSetting('delivery_enabled', true);
    ph = await createPharmacy(ctx, {
      wilayaId: area.wilayaId,
      communeId: area.id,
      lat: 36.75,
      lng: 3.05,
      delivery: true,
    });
    pharmacist = await addStaff(ctx, ph.pharmacyId, 'PHARMACIST');
    assistant = await addStaff(ctx, ph.pharmacyId, 'ASSISTANT');
    const [zone] = await ctx.db
      .insert(deliveryZones)
      .values({ wilayaId: area.wilayaId, communeId: area.id })
      .returning();
    await ctx.db.insert(deliveryFeeRules).values({
      zoneId: zone.id,
      baseFeeCentimes: 20000,
      perKmCentimes: 5000,
      minFeeCentimes: 25000,
      maxFeeCentimes: 80000,
    });
  });
  afterAll(async () => {
    await setSetting('delivery_enabled', false);
    await ctx.app.close();
  });

  async function newRequest(opts: { delivery?: boolean } = {}) {
    const p = await registerPatient(ctx);
    const addressId = await createAddress(
      ctx,
      p.access_token,
      area.wilayaId,
      area.id,
      36.77,
      3.05,
    );
    const fileId = await uploadFile(ctx, p.access_token, 'PRESCRIPTION');
    const res = await ctx
      .http()
      .post('/requests')
      .set(bearer(p.access_token))
      .send({
        request_type: 'PRESCRIPTION',
        file_ids: [fileId],
        address_id: addressId,
        delivery_wanted: !!opts.delivery,
        consent_to_share: true,
        pharmacy_ids: [ph.pharmacyId],
        items: [{ raw_name: 'Paracetamol 1g', quantity: 2 }],
      })
      .expect(201);
    return { patient: p, request: res.body.data };
  }

  const offerBody = (
    requestItemId: string,
    extra: Record<string, unknown> = {},
  ) => ({
    items: [
      {
        request_item_id: requestItemId,
        name: 'Doliprane 1000mg',
        quantity_offered: 2,
        unit_price_centimes: 25000,
        availability: 'AVAILABLE',
      },
      {
        name: 'Sirop toux',
        quantity_offered: 1,
        unit_price_centimes: 99999,
        availability: 'UNAVAILABLE',
      },
    ],
    preparation_minutes: 20,
    delivery_available: false,
    ...extra,
  });

  describe('registration & verification guard', () => {
    it('registers in PENDING_VERIFICATION; unverified pharmacies cannot use pharmacy features', async () => {
      const phone = uniquePhone();
      await ctx
        .http()
        .post('/pharmacies/register')
        .send({
          phone,
          password: PASSWORD,
          first_name: 'Owner',
          last_name: 'New',
          preferred_language: 'fr',
          consents: CONSENTS,
          pharmacy: {
            name_fr: 'Pharmacie Neuve',
            name_ar: 'صيدلية جديدة',
            authorization_number: `AUT-${phone}`,
            wilaya_id: area.wilayaId,
            commune_id: area.id,
            address_line: '2 Rue Neuve',
          },
        })
        .expect(202);
      const v = await ctx
        .http()
        .post('/auth/otp/verify')
        .send({ target: phone, purpose: 'REGISTER', code: lastOtp(ctx, phone) })
        .expect(200);
      const token = v.body.data.access_token;

      const me = await ctx
        .http()
        .get('/pharmacy/me')
        .set(bearer(token))
        .expect(200);
      expect(me.body.data).toMatchObject({
        status: 'PENDING_VERIFICATION',
        my_staff_role: 'OWNER',
      });
      expect(
        (
          await ctx
            .http()
            .get('/pharmacy/requests')
            .set(bearer(token))
            .expect(403)
        ).body.error.code,
      ).toBe('ACCOUNT_PENDING_VERIFICATION');

      // Owner account approved, pharmacy still pending → still no requests / offers.
      await ctx.db
        .update(users)
        .set({ status: 'ACTIVE' })
        .where(eq(users.id, v.body.data.user.id));
      expect(
        (
          await ctx
            .http()
            .get('/pharmacy/requests')
            .set(bearer(token))
            .expect(403)
        ).body.error.code,
      ).toBe('PHARMACY_NOT_VERIFIED');
      const { request } = await newRequest();
      const offer = await ctx
        .http()
        .post(`/pharmacy/requests/${request.id}/offers`)
        .set(bearer(token))
        .send(offerBody(request.items[0].id))
        .expect(403);
      expect(offer.body.error.code).toBe('PHARMACY_NOT_VERIFIED');

      // Verification workflow after a rejection.
      await ctx.db
        .update(pharmacies)
        .set({ status: 'REJECTED', rejectionReason: 'Diplôme illisible' })
        .where(eq(pharmacies.id, me.body.data.id));
      let status = await ctx
        .http()
        .get('/pharmacy/verification')
        .set(bearer(token))
        .expect(200);
      expect(status.body.data).toMatchObject({
        status: 'REJECTED',
        rejection_reason: 'Diplôme illisible',
        can_submit: false,
      });
      expect(status.body.data.missing_documents.sort()).toEqual([
        'AUTHORIZATION',
        'ID',
        'PHARMACIST_DIPLOMA',
      ]);
      const early = await ctx
        .http()
        .post('/pharmacy/verification/submit')
        .set(bearer(token))
        .expect(400);
      expect(early.body.error.code).toBe('PHARMACY_DOCUMENTS_MISSING');
      for (const doc_type of ['AUTHORIZATION', 'PHARMACIST_DIPLOMA', 'ID']) {
        const file_id = await uploadFile(ctx, token, 'PHARMACY_DOC');
        await ctx
          .http()
          .post('/pharmacy/documents')
          .set(bearer(token))
          .send({ doc_type, file_id })
          .expect(201);
      }
      status = await ctx
        .http()
        .post('/pharmacy/verification/submit')
        .set(bearer(token))
        .expect(200);
      expect(status.body.data).toMatchObject({
        status: 'PENDING_VERIFICATION',
        missing_documents: [],
      });
      expect(
        (
          await ctx
            .http()
            .post('/pharmacy/verification/submit')
            .set(bearer(token))
            .expect(409)
        ).body.error.code,
      ).toBe('PHARMACY_VERIFICATION_NOT_ALLOWED');
    });
  });

  describe('role matrix', () => {
    it('restricts profile, staff, decline and substitutions by staff role', async () => {
      expect(
        (
          await ctx
            .http()
            .patch('/pharmacy/me')
            .set(bearer(assistant.token))
            .send({ accepts_requests: true })
            .expect(403)
        ).body.error.code,
      ).toBe('PHARMACY_ACCESS_DENIED');
      expect(
        (
          await ctx
            .http()
            .patch('/pharmacy/me')
            .set(bearer(pharmacist.token))
            .send({ accepts_requests: true })
            .expect(403)
        ).body.error.code,
      ).toBe('PHARMACY_ACCESS_DENIED');
      await ctx
        .http()
        .patch('/pharmacy/me')
        .set(bearer(ph.ownerToken))
        .send({ accepts_requests: true })
        .expect(200);
      const locked = await ctx
        .http()
        .patch('/pharmacy/me')
        .set(bearer(ph.ownerToken))
        .send({ authorization_number: 'NEW-123' })
        .expect(403);
      expect(locked.body.error.code).toBe('PHARMACY_FIELD_LOCKED');

      await ctx
        .http()
        .get('/pharmacy/staff')
        .set(bearer(pharmacist.token))
        .expect(403);
      const staff = await ctx
        .http()
        .get('/pharmacy/staff')
        .set(bearer(ph.ownerToken))
        .expect(200);
      expect(staff.body.data.length).toBe(3);

      const { request } = await newRequest();
      expect(
        (
          await ctx
            .http()
            .post(`/pharmacy/requests/${request.id}/decline`)
            .set(bearer(assistant.token))
            .send({ reason: 'Non' })
            .expect(403)
        ).body.error.code,
      ).toBe('PHARMACY_ACCESS_DENIED');
      const alt = await ctx
        .http()
        .post(`/pharmacy/requests/${request.id}/offers`)
        .set(bearer(assistant.token))
        .send({
          items: [
            {
              request_item_id: request.items[0].id,
              name: 'Générique',
              quantity_offered: 2,
              unit_price_centimes: 10000,
              availability: 'ALTERNATIVE',
              is_alternative: true,
              alternative_reason: 'Rupture',
            },
          ],
          delivery_available: false,
        })
        .expect(403);
      expect(alt.body.error.code).toBe('OFFER_ALTERNATIVE_REQUIRES_PHARMACIST');
      // Assistants can still prepare a normal offer.
      await ctx
        .http()
        .post(`/pharmacy/requests/${request.id}/offers`)
        .set(bearer(assistant.token))
        .send(offerBody(request.items[0].id))
        .expect(201);
    });

    it('owner manages staff: license required for pharmacists, deactivation revokes sessions', async () => {
      const list = await ctx
        .http()
        .get('/pharmacy/staff')
        .set(bearer(ph.ownerToken))
        .expect(200);
      const asst = list.body.data.find(
        (s: { user_id: string }) => s.user_id === assistant.userId,
      );
      const noLicense = await ctx
        .http()
        .patch(`/pharmacy/staff/${asst.id}`)
        .set(bearer(ph.ownerToken))
        .send({ staff_role: 'PHARMACIST' })
        .expect(400);
      expect(noLicense.body.error.code).toBe('STAFF_LICENSE_REQUIRED');
      const owner = list.body.data.find(
        (s: { staff_role: string }) => s.staff_role === 'OWNER',
      );
      expect(
        (
          await ctx
            .http()
            .patch(`/pharmacy/staff/${owner.id}`)
            .set(bearer(ph.ownerToken))
            .send({ is_active: false })
            .expect(403)
        ).body.error.code,
      ).toBe('STAFF_CANNOT_MODIFY_OWNER');

      const temp = await addStaff(ctx, ph.pharmacyId, 'ASSISTANT');
      const all = await ctx
        .http()
        .get('/pharmacy/staff?limit=50')
        .set(bearer(ph.ownerToken))
        .expect(200);
      const row = all.body.data.find(
        (s: { user_id: string }) => s.user_id === temp.userId,
      );
      await ctx
        .http()
        .patch(`/pharmacy/staff/${row.id}`)
        .set(bearer(ph.ownerToken))
        .send({ is_active: false })
        .expect(200);
      expect(
        (
          await ctx
            .http()
            .get('/pharmacy/me')
            .set(bearer(temp.token))
            .expect(401)
        ).body.error.code,
      ).toBe('AUTH_SESSION_REVOKED');
    });
  });

  describe('inbox & access logging', () => {
    it('marks the request viewed, logs sensitive access, hides the street, and gates prescription files by role', async () => {
      const { request } = await newRequest();
      const res = await ctx
        .http()
        .get(`/pharmacy/requests/${request.id}`)
        .set(bearer(assistant.token))
        .expect(200);
      expect(res.body.data).toMatchObject({
        recipient_status: 'VIEWED',
        can_view_prescription: false,
        patient: { first_name: 'Amina' },
      });
      expect(res.body.data.delivery_area).not.toHaveProperty('street_line');
      expect(JSON.stringify(res.body.data)).not.toContain('5 Rue Patient');

      const asPharmacist = await ctx
        .http()
        .get(`/pharmacy/requests/${request.id}`)
        .set(bearer(pharmacist.token))
        .expect(200);
      expect(asPharmacist.body.data.can_view_prescription).toBe(true);

      const logs = await ctx.db
        .select()
        .from(sensitiveAccessLogs)
        .where(eq(sensitiveAccessLogs.resourceId, request.id));
      expect(logs.map((l) => l.actorUserId)).toEqual(
        expect.arrayContaining([assistant.userId, pharmacist.userId]),
      );
      const [rr] = await ctx.db
        .select()
        .from(requestRecipients)
        .where(
          and(
            eq(requestRecipients.requestId, request.id),
            eq(requestRecipients.pharmacyId, ph.pharmacyId),
          ),
        );
      expect(rr.viewedAt).not.toBeNull();

      const list = await ctx
        .http()
        .get('/pharmacy/requests?recipient_status=VIEWED')
        .set(bearer(ph.ownerToken))
        .expect(200);
      expect(
        list.body.data.map((r: { request_id: string }) => r.request_id),
      ).toContain(request.id);
    });

    it('interest does not create offers; clarification moves the request and opens a conversation', async () => {
      const { request, patient } = await newRequest();
      const interest = await ctx
        .http()
        .post(`/pharmacy/requests/${request.id}/accept-interest`)
        .set(bearer(assistant.token))
        .expect(200);
      expect(interest.body.data.recipient_status).toBe('INTERESTED');
      const offers = await ctx
        .http()
        .get(`/requests/${request.id}/offers`)
        .set(bearer(patient.access_token))
        .expect(200);
      expect(offers.body.data).toEqual([]);

      const q = await ctx
        .http()
        .post(`/pharmacy/requests/${request.id}/clarification`)
        .set(bearer(pharmacist.token))
        .send({ question: 'Pouvez-vous préciser le dosage ?' })
        .expect(200);
      expect(q.body.data.request_status).toBe('CLARIFICATION_REQUIRED');
      const [conv] = await ctx.db
        .select()
        .from(conversations)
        .where(eq(conversations.id, q.body.data.conversation_id));
      expect(conv).toMatchObject({
        requestId: request.id,
        pharmacyId: ph.pharmacyId,
        patientUserId: patient.user.id,
      });
      const [r] = await ctx.db
        .select({ status: requests.status })
        .from(requests)
        .where(eq(requests.id, request.id));
      expect(r.status).toBe('CLARIFICATION_REQUIRED');
    });

    it('declines with a reason', async () => {
      const { request } = await newRequest();
      const res = await ctx
        .http()
        .post(`/pharmacy/requests/${request.id}/decline`)
        .set(bearer(pharmacist.token))
        .send({ reason: 'Rupture de stock' })
        .expect(200);
      expect(res.body.data.recipient_status).toBe('DECLINED');
      expect(
        (
          await ctx
            .http()
            .post(`/pharmacy/requests/${request.id}/accept-interest`)
            .set(bearer(pharmacist.token))
            .expect(409)
        ).body.error.code,
      ).toBe('RECIPIENT_CLOSED');
    });
  });

  describe('offers', () => {
    it('computes every amount server-side and ignores client totals', async () => {
      const { request, patient } = await newRequest();
      const forged = await ctx
        .http()
        .post(`/pharmacy/requests/${request.id}/offers`)
        .set(bearer(pharmacist.token))
        .send({ ...offerBody(request.items[0].id), total_centimes: 1 })
        .expect(400);
      expect(forged.body.error.code).toBe('VALIDATION_FAILED');

      const created = await ctx
        .http()
        .post(`/pharmacy/requests/${request.id}/offers`)
        .set(bearer(pharmacist.token))
        .send(offerBody(request.items[0].id))
        .expect(201);
      const o = created.body.data;
      expect(o).toMatchObject({
        status: 'DRAFT',
        items_subtotal_centimes: 50000,
        delivery_fee_centimes: 0,
        service_fee_centimes: 0,
        total_centimes: 50000,
      });
      expect(o.items[1]).toMatchObject({
        availability: 'UNAVAILABLE',
        quantity_offered: 0,
        line_total_centimes: 0,
      });
      expect(o.items[0]).toMatchObject({
        quantity_requested: 2,
        line_total_centimes: 50000,
      });

      // Patients never see drafts.
      expect(
        (
          await ctx
            .http()
            .get(`/requests/${request.id}/offers`)
            .set(bearer(patient.access_token))
            .expect(200)
        ).body.data,
      ).toEqual([]);
      const dup = await ctx
        .http()
        .post(`/pharmacy/requests/${request.id}/offers`)
        .set(bearer(pharmacist.token))
        .send(offerBody(request.items[0].id))
        .expect(409);
      expect(dup.body.error.code).toBe('OFFER_ALREADY_EXISTS');

      const sent = await ctx
        .http()
        .post(`/pharmacy/offers/${o.id}/send`)
        .set(bearer(pharmacist.token))
        .expect(200);
      expect(sent.body.data.status).toBe('SENT');
      const detail = await ctx
        .http()
        .get(`/requests/${request.id}`)
        .set(bearer(patient.access_token))
        .expect(200);
      expect(detail.body.data).toMatchObject({
        status: 'OFFER_AVAILABLE',
        offers_summary: { count: 1, best_total_centimes: 50000 },
      });
      expect(detail.body.data.items[0].confirmed_by_pharmacist).toBe(true);
      expect(
        (
          await ctx
            .http()
            .patch(`/pharmacy/offers/${o.id}`)
            .set(bearer(pharmacist.token))
            .send(offerBody(request.items[0].id))
            .expect(409)
        ).body.error.code,
      ).toBe('OFFER_NOT_EDITABLE');

      // Withdrawing the only offer reopens the request.
      await ctx
        .http()
        .post(`/pharmacy/offers/${o.id}/withdraw`)
        .set(bearer(pharmacist.token))
        .expect(200);
      const reopened = await ctx
        .http()
        .get(`/requests/${request.id}`)
        .set(bearer(patient.access_token))
        .expect(200);
      expect(reopened.body.data.status).toBe('AWAITING_PHARMACY_RESPONSE');
    });

    it('computes the delivery fee from zone rules (base + per km, clamped)', async () => {
      const { request } = await newRequest({ delivery: true });
      const res = await ctx
        .http()
        .post(`/pharmacy/requests/${request.id}/offers`)
        .set(bearer(pharmacist.token))
        .send(offerBody(request.items[0].id, { delivery_available: true }))
        .expect(201);
      // ~2.2 km between pharmacy (36.75, 3.05) and address (36.77, 3.05): 20000 + 2.2 × 5000 = 31000.
      expect(res.body.data.delivery_fee_centimes).toBeGreaterThanOrEqual(30000);
      expect(res.body.data.delivery_fee_centimes).toBeLessThanOrEqual(32000);
      expect(res.body.data.total_centimes).toBe(
        50000 + res.body.data.delivery_fee_centimes,
      );

      const pickupReq = await newRequest();
      const noDelivery = await ctx
        .http()
        .post(`/pharmacy/requests/${pickupReq.request.id}/offers`)
        .set(bearer(pharmacist.token))
        .send(
          offerBody(pickupReq.request.items[0].id, {
            delivery_available: true,
          }),
        )
        .expect(422);
      expect(noDelivery.body.error.code).toBe('OFFER_DELIVERY_NOT_AVAILABLE');
    });

    it('blocks items of restricted categories', async () => {
      const { request } = await newRequest();
      const controlled = await createMedicine(ctx, 'CONTROLLED', 'Tramadol');
      const res = await ctx
        .http()
        .post(`/pharmacy/requests/${request.id}/offers`)
        .set(bearer(pharmacist.token))
        .send({
          items: [
            {
              medicine_id: controlled,
              name: 'Tramadol',
              quantity_offered: 1,
              unit_price_centimes: 1000,
              availability: 'AVAILABLE',
            },
          ],
          delivery_available: false,
        })
        .expect(422);
      expect(res.body.error.code).toBe('OFFER_ITEM_RESTRICTED');
    });

    it('lets the patient compare offers and approve/reject each alternative', async () => {
      const { request, patient } = await newRequest();
      const created = await ctx
        .http()
        .post(`/pharmacy/requests/${request.id}/offers`)
        .set(bearer(pharmacist.token))
        .send({
          items: [
            {
              request_item_id: request.items[0].id,
              name: 'Paracetamol générique',
              quantity_offered: 2,
              unit_price_centimes: 15000,
              availability: 'ALTERNATIVE',
              is_alternative: true,
              alternative_reason: 'Marque en rupture',
            },
          ],
          delivery_available: false,
        })
        .expect(201);
      const offerId = created.body.data.id;
      await ctx
        .http()
        .post(`/pharmacy/offers/${offerId}/send`)
        .set(bearer(pharmacist.token))
        .expect(200);

      const compare = await ctx
        .http()
        .get(`/requests/${request.id}/offers/compare`)
        .set(bearer(patient.access_token))
        .expect(200);
      expect(compare.body.data.offers[0]).toMatchObject({
        offer_id: offerId,
        alternatives: 1,
        alternatives_pending: 1,
        missing_items: [],
        total_centimes: 30000,
      });

      const itemId = created.body.data.items[0].id;
      const rejected = await ctx
        .http()
        .post(`/offers/${offerId}/items/${itemId}/approval`)
        .set(bearer(patient.access_token))
        .send({ decision: 'REJECTED' })
        .expect(200);
      expect(rejected.body.data).toMatchObject({
        alternatives_pending: 0,
        effective_total_centimes: 0,
      });
      expect(
        (
          await ctx
            .http()
            .post(`/offers/${offerId}/items/${itemId}/approval`)
            .set(bearer(patient.access_token))
            .send({ decision: 'APPROVED' })
            .expect(409)
        ).body.error.code,
      ).toBe('OFFER_ITEM_APPROVAL_NOT_PENDING');

      const other = await registerPatient(ctx);
      await ctx
        .http()
        .get(`/offers/${offerId}`)
        .set(bearer(other.access_token))
        .expect(404);
    });
  });

  describe('stock & catalog', () => {
    it('searches the catalog (DCI, typo-tolerant) and manages stock incl. CSV import report', async () => {
      const med = await createMedicine(ctx, 'OTC', 'Ibuprofene');
      const search = await ctx
        .http()
        .get('/medicines/search?q=ibuprofen')
        .set(bearer(ph.ownerToken))
        .expect(200);
      expect(search.body.data.map((m: { id: string }) => m.id)).toContain(med);

      await ctx
        .http()
        .put(`/pharmacy/stock/${med}`)
        .set(bearer(assistant.token))
        .send({
          stock_status: 'IN_STOCK',
          quantity: 12,
          unit_price_centimes: 18000,
        })
        .expect(200);
      const stock = await ctx
        .http()
        .get('/pharmacy/stock?stock_status=IN_STOCK')
        .set(bearer(ph.ownerToken))
        .expect(200);
      expect(
        stock.body.data.find(
          (s: { medicine: { id: string } }) => s.medicine.id === med,
        ),
      ).toMatchObject({ quantity: 12, unit_price_centimes: 18000 });

      const csv = `medicine_id;stock_status;quantity;unit_price_centimes\n${med};LOW;2;19000\n00000000-0000-4000-8000-000000000000;IN_STOCK;1;100\n${med};WRONG;1;1\n`;
      const dry = await ctx
        .http()
        .post('/pharmacy/stock/import?dry_run=true')
        .set(bearer(pharmacist.token))
        .attach('file', Buffer.from(csv), 'stock.csv')
        .expect(200);
      expect(dry.body.data).toMatchObject({
        dry_run: true,
        processed: 3,
        updated: 1,
      });
      expect(
        dry.body.data.errors.map((e: { line: number; field: string }) => [
          e.line,
          e.field,
        ]),
      ).toEqual([
        [3, 'medicine_id'],
        [4, 'stock_status'],
      ]);
      await ctx
        .http()
        .post('/pharmacy/stock/import')
        .set(bearer(assistant.token))
        .attach('file', Buffer.from(csv), 'stock.csv')
        .expect(403);
      await ctx
        .http()
        .post('/pharmacy/stock/import')
        .set(bearer(pharmacist.token))
        .attach('file', Buffer.from(csv), 'stock.csv')
        .expect(200);
      const after = await ctx
        .http()
        .get('/pharmacy/stock?stock_status=LOW')
        .set(bearer(ph.ownerToken))
        .expect(200);
      expect(
        after.body.data.find(
          (s: { medicine: { id: string } }) => s.medicine.id === med,
        ),
      ).toMatchObject({ quantity: 2, unit_price_centimes: 19000 });
    });
  });

  describe('profile resources, complaints, reports', () => {
    it('manages hours, on-duty, service areas and masked payout accounts', async () => {
      const bad = await ctx
        .http()
        .put('/pharmacy/opening-hours')
        .set(bearer(ph.ownerToken))
        .send({
          days: [
            {
              day_of_week: 1,
              is_closed: false,
              is_24h: false,
              open_time: '08:00',
            },
          ],
        })
        .expect(400);
      expect(bad.body.error.code).toBe('OPENING_HOURS_INVALID');
      const hours = await ctx
        .http()
        .put('/pharmacy/opening-hours')
        .set(bearer(pharmacist.token))
        .send({
          days: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
            day_of_week: d,
            is_closed: false,
            is_24h: true,
          })),
        })
        .expect(200);
      expect(hours.body.data).toHaveLength(7);

      const from = new Date(Date.now() + 3600_000).toISOString();
      const to = new Date(Date.now() + 13 * 3600_000).toISOString();
      const duty = await ctx
        .http()
        .post('/pharmacy/on-duty')
        .set(bearer(ph.ownerToken))
        .send({ date_from: from, date_to: to })
        .expect(201);
      await ctx
        .http()
        .delete(`/pharmacy/on-duty/${duty.body.data.id}`)
        .set(bearer(ph.ownerToken))
        .expect(200);

      const payout = await ctx
        .http()
        .post('/pharmacy/payout-accounts')
        .set(bearer(ph.ownerToken))
        .send({
          account_type: 'BANK',
          holder_name: 'EURL Test',
          account_number: '00799999001234567890',
        })
        .expect(201);
      expect(payout.body.data.account_number_masked).toBe(
        '****************7890',
      );
      expect(JSON.stringify(payout.body)).not.toContain('00799999001234567890');
      await ctx
        .http()
        .get('/pharmacy/payout-accounts')
        .set(bearer(pharmacist.token))
        .expect(403);
    });

    it('patients file complaints; the pharmacy owner/pharmacist sees and replies, assistants cannot', async () => {
      const p = await registerPatient(ctx);
      const c = await ctx
        .http()
        .post('/complaints')
        .set(bearer(p.access_token))
        .send({
          against_type: 'PHARMACY',
          against_id: ph.pharmacyId,
          category: 'BEHAVIOUR',
          description: 'Accueil désagréable au comptoir.',
        })
        .expect(201);
      expect(c.body.data.reference).toMatch(/^CMP-\d{4}-\d{6}$/);
      const list = await ctx
        .http()
        .get('/pharmacy/complaints')
        .set(bearer(ph.ownerToken))
        .expect(200);
      expect(list.body.data.map((x: { id: string }) => x.id)).toContain(
        c.body.data.id,
      );
      await ctx
        .http()
        .get('/pharmacy/complaints')
        .set(bearer(assistant.token))
        .expect(403);
      const reply = await ctx
        .http()
        .post(`/pharmacy/complaints/${c.body.data.id}/reply`)
        .set(bearer(pharmacist.token))
        .send({ body: 'Nous sommes désolés.' })
        .expect(201);
      expect(reply.body.data.messages).toHaveLength(1);
      const mine = await ctx
        .http()
        .get(`/complaints/${c.body.data.id}`)
        .set(bearer(p.access_token))
        .expect(200);
      expect(mine.body.data.messages[0].body).toBe('Nous sommes désolés.');
    });

    it('returns an activity summary', async () => {
      const res = await ctx
        .http()
        .get('/pharmacy/reports/summary')
        .set(bearer(ph.ownerToken))
        .expect(200);
      expect(res.body.data.requests_received).toBeGreaterThan(0);
      expect(res.body.data).toHaveProperty('avg_response_minutes');
      expect(res.body.data.offers_sent).toBeGreaterThan(0);
      await ctx
        .http()
        .get('/pharmacy/reports/summary')
        .set(bearer(assistant.token))
        .expect(403);
    });
  });
});
