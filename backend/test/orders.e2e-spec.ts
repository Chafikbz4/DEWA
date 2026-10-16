import { and, eq, lt, ne } from 'drizzle-orm';
import {
  offers,
  orders,
  platformSettings,
  requests,
} from '../src/database/schema';
import {
  OrderStateMachineService,
  SYSTEM_ACTOR,
} from '../src/modules/orders/order-state-machine.service';
import { OrdersService } from '../src/modules/orders/orders.service';
import { SettingsService } from '../src/modules/settings/settings.service';
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
  PharmacyFixture,
  registerPatient,
  TestCtx,
  uploadFile,
  waitFor,
} from './utils';

describe('Orders & state machine (e2e)', () => {
  let ctx: TestCtx;
  let area: { id: number; wilayaId: number };
  let ph: PharmacyFixture;
  let ph2: PharmacyFixture;
  let pharmacist: { userId: string; token: string };
  let assistant: { userId: string; token: string };
  let sm: OrderStateMachineService;

  const setSetting = async (key: string, value: unknown) => {
    await ctx.db
      .update(platformSettings)
      .set({ value })
      .where(eq(platformSettings.key, key));
    ctx.app.get(SettingsService).invalidate();
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    sm = ctx.app.get(OrderStateMachineService);
    area = await isolatedCommune(ctx);
    await enablePolicy(ctx, 'PRESCRIPTION');
    await setSetting('payment_before_validation', false);
    ph = await createPharmacy(ctx, {
      wilayaId: area.wilayaId,
      communeId: area.id,
    });
    ph2 = await createPharmacy(ctx, {
      wilayaId: area.wilayaId,
      communeId: area.id,
    });
    pharmacist = await addStaff(ctx, ph.pharmacyId, 'PHARMACIST');
    assistant = await addStaff(ctx, ph.pharmacyId, 'ASSISTANT');
  });
  afterAll(async () => {
    await setSetting('payment_before_validation', false);
    await ctx.app.close();
  });

  /** Request to both pharmacies, a SENT offer from `ph` (and optionally from ph2). */
  async function offerFlow(
    opts: { alternative?: boolean; second?: boolean } = {},
  ) {
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
        pharmacy_ids: [ph.pharmacyId, ph2.pharmacyId],
        items: [
          { raw_name: 'Augmentin 1g', quantity: 2 },
          { raw_name: 'Sirop', quantity: 1 },
        ],
      })
      .expect(201);
    const req = r.body.data;
    const items = [
      {
        request_item_id: req.items[0].id,
        name: 'Augmentin 1g',
        quantity_offered: 2,
        unit_price_centimes: 40000,
        availability: 'AVAILABLE',
      },
      opts.alternative
        ? {
            request_item_id: req.items[1].id,
            name: 'Sirop générique',
            quantity_offered: 1,
            unit_price_centimes: 15000,
            availability: 'ALTERNATIVE',
            is_alternative: true,
            alternative_reason: 'Rupture',
          }
        : {
            request_item_id: req.items[1].id,
            name: 'Sirop',
            quantity_offered: 0,
            unit_price_centimes: 20000,
            availability: 'UNAVAILABLE',
          },
    ];
    const o = await ctx
      .http()
      .post(`/pharmacy/requests/${req.id}/offers`)
      .set(bearer(pharmacist.token))
      .send({ items, delivery_available: false, preparation_minutes: 15 })
      .expect(201);
    await ctx
      .http()
      .post(`/pharmacy/offers/${o.body.data.id}/send`)
      .set(bearer(pharmacist.token))
      .expect(200);
    let secondOfferId: string | undefined;
    if (opts.second) {
      const o2 = await ctx
        .http()
        .post(`/pharmacy/requests/${req.id}/offers`)
        .set(bearer(ph2.ownerToken))
        .send({ items: [items[0]], delivery_available: false })
        .expect(201);
      await ctx
        .http()
        .post(`/pharmacy/offers/${o2.body.data.id}/send`)
        .set(bearer(ph2.ownerToken))
        .expect(200);
      secondOfferId = o2.body.data.id;
    }
    return {
      patient: p,
      request: req,
      offerId: o.body.data.id as string,
      offerItems: o.body.data.items,
      secondOfferId,
    };
  }

  const accept = (
    token: string,
    offerId: string,
    key?: string,
    fulfillment = 'PICKUP',
  ) => {
    const call = ctx
      .http()
      .post(`/offers/${offerId}/accept`)
      .set(bearer(token));
    if (key) call.set('Idempotency-Key', key);
    return call.send({ fulfillment_type: fulfillment });
  };

  describe('accepting an offer', () => {
    it('creates a VALIDATION_FIRST order with frozen prices, rejects other offers, marks the request accepted', async () => {
      const f = await offerFlow({ second: true });
      const res = await accept(f.patient.access_token, f.offerId).expect(201);
      const o = res.body.data;
      expect(o).toMatchObject({
        status: 'PHARMACIST_VALIDATION_PENDING',
        workflow_variant: 'VALIDATION_FIRST',
        fulfillment_type: 'PICKUP',
        items_subtotal_centimes: 80000,
        delivery_fee_centimes: 0,
        total_centimes: 80000,
        payment_deadline_at: null,
        next_actions: ['CANCEL'],
      });
      expect(o.reference).toMatch(/^ORD-\d{4}-\d{6}$/);
      expect(o.items).toEqual([
        expect.objectContaining({
          name: 'Augmentin 1g',
          quantity: 2,
          line_total_centimes: 80000,
        }),
      ]);
      expect(o.pharmacy).toMatchObject({ id: ph.pharmacyId });

      const [second] = await ctx.db
        .select({ s: offers.status })
        .from(offers)
        .where(eq(offers.id, f.secondOfferId!));
      expect(second.s).toBe('REJECTED');
      const [r] = await ctx.db
        .select({ s: requests.status })
        .from(requests)
        .where(eq(requests.id, f.request.id));
      expect(r.s).toBe('OFFER_ACCEPTED');
      expect(
        (
          await ctx
            .http()
            .post(`/requests/${f.request.id}/cancel`)
            .set(bearer(f.patient.access_token))
            .send({})
            .expect(409)
        ).body.error.code,
      ).toBe('REQUEST_HAS_ORDER');
      await waitFor(
        async () =>
          (
            await ctx
              .http()
              .get('/notifications?type=OFFER_ACCEPTED')
              .set(bearer(ph.ownerToken))
          ).body.data?.length,
      );
    });

    it('requires every substitution to be decided; rejected alternatives are excluded', async () => {
      const f = await offerFlow({ alternative: true });
      expect(
        (await accept(f.patient.access_token, f.offerId).expect(409)).body.error
          .code,
      ).toBe('ORDER_ALTERNATIVES_PENDING');
      const alt = f.offerItems.find(
        (i: { is_alternative: boolean }) => i.is_alternative,
      );
      await ctx
        .http()
        .post(`/offers/${f.offerId}/items/${alt.id}/approval`)
        .set(bearer(f.patient.access_token))
        .send({ decision: 'REJECTED' })
        .expect(200);
      const res = await accept(f.patient.access_token, f.offerId).expect(201);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.total_centimes).toBe(80000);
    });

    it('lets only one of two concurrent accepts win', async () => {
      const f = await offerFlow();
      const [a, b] = await Promise.all([
        accept(f.patient.access_token, f.offerId),
        accept(f.patient.access_token, f.offerId),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect([a, b].find((x) => x.status === 409)!.body.error.code).toBe(
        'ORDER_OFFER_NOT_AVAILABLE',
      );
      const rows = await ctx.db
        .select()
        .from(orders)
        .where(eq(orders.offerId, f.offerId));
      expect(rows).toHaveLength(1);
    });

    it('replays the same response for the same Idempotency-Key and refuses key reuse with another body', async () => {
      const f = await offerFlow();
      const key = `accept-${f.offerId}`;
      const first = await accept(f.patient.access_token, f.offerId, key).expect(
        201,
      );
      const replay = await accept(
        f.patient.access_token,
        f.offerId,
        key,
      ).expect(201);
      expect(replay.body.data.id).toBe(first.body.data.id);
      const reused = await accept(
        f.patient.access_token,
        f.offerId,
        key,
        'DELIVERY',
      ).expect(409);
      expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(
        (await accept(f.patient.access_token, f.offerId, 'short').expect(400))
          .body.error.code,
      ).toBe('IDEMPOTENCY_KEY_INVALID');
      expect(
        await ctx.db.select().from(orders).where(eq(orders.offerId, f.offerId)),
      ).toHaveLength(1);
    });

    it('refuses delivery when the offer does not deliver, and drafts/other patients', async () => {
      const f = await offerFlow();
      expect(
        (
          await accept(
            f.patient.access_token,
            f.offerId,
            undefined,
            'DELIVERY',
          ).expect(422)
        ).body.error.code,
      ).toBe('ORDER_DELIVERY_NOT_AVAILABLE');
      const other = await registerPatient(ctx);
      expect(
        (await accept(other.access_token, f.offerId).expect(404)).body.error
          .code,
      ).toBe('OFFER_NOT_FOUND');
    });
  });

  describe('validation, fulfillment, timeline (pickup, validation first)', () => {
    it('runs validation → payment → preparation → ready → hand-over with the collection code', async () => {
      const f = await offerFlow();
      const order = (
        await accept(f.patient.access_token, f.offerId).expect(201)
      ).body.data;

      // Assistants cannot validate; the decision must be explicit.
      expect(
        (
          await ctx
            .http()
            .post(`/pharmacy/orders/${order.id}/validate`)
            .set(bearer(assistant.token))
            .send({ decision: 'APPROVE', confirm: true, note: 'ok ok' })
            .expect(403)
        ).body.error.code,
      ).toBe('PHARMACY_ACCESS_DENIED');
      expect(
        (
          await ctx
            .http()
            .post(`/pharmacy/orders/${order.id}/validate`)
            .set(bearer(pharmacist.token))
            .send({ decision: 'APPROVE', confirm: false, note: 'ok ok' })
            .expect(400)
        ).body.error.code,
      ).toBe('VALIDATION_FAILED');
      expect(
        (
          await ctx
            .http()
            .post(`/pharmacy/orders/${order.id}/start-preparing`)
            .set(bearer(pharmacist.token))
            .expect(409)
        ).body.error.code,
      ).toBe('ORDER_INVALID_TRANSITION');

      const validated = await ctx
        .http()
        .post(`/pharmacy/orders/${order.id}/validate`)
        .set(bearer(pharmacist.token))
        .send({
          decision: 'APPROVE',
          confirm: true,
          note: 'Ordonnance conforme.',
        })
        .expect(200);
      expect(validated.body.data).toMatchObject({
        status: 'AWAITING_PAYMENT',
        pharmacist_validated: true,
      });
      expect(
        new Date(validated.body.data.payment_deadline_at).getTime(),
      ).toBeGreaterThan(Date.now());
      expect(validated.body.data.patient).toEqual({ first_name: 'Amina' });

      // Payment (Phase 7) – driven by the SYSTEM actor here.
      await sm.transition(order.id, 'PAYMENT_PENDING', SYSTEM_ACTOR);
      await sm.transition(order.id, 'PAYMENT_CONFIRMED', SYSTEM_ACTOR);
      // A patient can never confirm payment.
      await expect(
        sm.transition(order.id, 'PREPARING', {
          kind: 'PATIENT',
          userId: f.patient.user.id,
          role: 'PATIENT',
        }),
      ).rejects.toMatchObject({ code: 'ORDER_ACTION_FORBIDDEN' });

      await ctx
        .http()
        .post(`/pharmacy/orders/${order.id}/start-preparing`)
        .set(bearer(assistant.token))
        .expect(200);
      const ready = await ctx
        .http()
        .post(`/pharmacy/orders/${order.id}/ready`)
        .set(bearer(assistant.token))
        .expect(200);
      expect(ready.body.data).toMatchObject({
        status: 'READY_FOR_PICKUP',
        next_actions: ['HANDOVER', 'CANCEL'],
      });

      const note = await waitFor(async () => {
        const res = await ctx
          .http()
          .get('/notifications?type=COLLECTION_CODE')
          .set(bearer(f.patient.access_token));
        return res.body.data?.[0];
      });
      // The reference also contains 6 digits – the code is the last number of the message.
      const code = note.body.match(/(\d{6})\D*$/)[1];
      const wrong = code === '000000' ? '111111' : '000000';
      expect(
        (
          await ctx
            .http()
            .post(`/pharmacy/orders/${order.id}/handover`)
            .set(bearer(assistant.token))
            .send({ collection_code: wrong })
            .expect(400)
        ).body.error.code,
      ).toBe('ORDER_COLLECTION_CODE_INVALID');
      const done = await ctx
        .http()
        .post(`/pharmacy/orders/${order.id}/handover`)
        .set(bearer(assistant.token))
        .send({ collection_code: code })
        .expect(200);
      expect(done.body.data.status).toBe('COMPLETED');

      await ctx
        .http()
        .patch('/me')
        .set(bearer(f.patient.access_token))
        .send({ preferred_language: 'ar' })
        .expect(200);
      const arToken = await login(ctx, f.patient.phone);
      const tl = await ctx
        .http()
        .get(`/orders/${order.id}/timeline`)
        .set(bearer(arToken))
        .expect(200);
      expect(
        tl.body.data.events.map((e: { status: string }) => e.status),
      ).toEqual([
        'PHARMACIST_VALIDATION_PENDING',
        'AWAITING_PAYMENT',
        'PAYMENT_PENDING',
        'PAYMENT_CONFIRMED',
        'PREPARING',
        'READY_FOR_PICKUP',
        'COMPLETED',
      ]);
      expect(tl.body.data.events[6]).toMatchObject({
        label: 'تم الاستلام',
        actor: 'PHARMACY',
      });
      expect(tl.body.data.events[2].actor).toBe('PLATFORM');

      // Terminal: nothing else possible.
      expect(
        (
          await ctx
            .http()
            .post(`/orders/${order.id}/cancel`)
            .set(bearer(arToken))
            .send({ reason: 'trop tard' })
            .expect(409)
        ).body.error.code,
      ).toBe('ORDER_NOT_CANCELLABLE');
    });

    it('locks the collection code after 5 wrong attempts until the patient regenerates it', async () => {
      const f = await offerFlow();
      const order = (
        await accept(f.patient.access_token, f.offerId).expect(201)
      ).body.data;
      await ctx
        .http()
        .post(`/pharmacy/orders/${order.id}/validate`)
        .set(bearer(pharmacist.token))
        .send({ decision: 'APPROVE', confirm: true, note: 'Conforme.' })
        .expect(200);
      await sm.transition(order.id, 'PAYMENT_PENDING', SYSTEM_ACTOR);
      await sm.transition(order.id, 'PAYMENT_CONFIRMED', SYSTEM_ACTOR);
      await ctx
        .http()
        .post(`/pharmacy/orders/${order.id}/start-preparing`)
        .set(bearer(pharmacist.token))
        .expect(200);
      await ctx
        .http()
        .post(`/pharmacy/orders/${order.id}/ready`)
        .set(bearer(pharmacist.token))
        .expect(200);
      const codes: string[] = [];
      for (let i = 0; i < 5; i++) {
        codes.push(
          (
            await ctx
              .http()
              .post(`/pharmacy/orders/${order.id}/handover`)
              .set(bearer(pharmacist.token))
              .send({ collection_code: '999999' })
          ).body.error.code,
        );
      }
      expect(codes.slice(-1)[0]).toBe('ORDER_COLLECTION_CODE_LOCKED');
      const fresh = await ctx
        .http()
        .post(`/orders/${order.id}/collection-code`)
        .set(bearer(f.patient.access_token))
        .expect(200);
      await ctx
        .http()
        .post(`/pharmacy/orders/${order.id}/handover`)
        .set(bearer(pharmacist.token))
        .send({ collection_code: fresh.body.data.collection_code })
        .expect(200);
    });

    it('pharmacist rejection cancels a validation-first order and closes the request', async () => {
      const f = await offerFlow();
      const order = (
        await accept(f.patient.access_token, f.offerId).expect(201)
      ).body.data;
      const res = await ctx
        .http()
        .post(`/pharmacy/orders/${order.id}/validate`)
        .set(bearer(pharmacist.token))
        .send({
          decision: 'REJECT',
          confirm: true,
          note: 'Ordonnance expirée.',
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        status: 'CANCELLED',
        cancel_reason: 'Ordonnance expirée.',
      });
      const [r] = await ctx.db
        .select({ s: requests.status })
        .from(requests)
        .where(eq(requests.id, f.request.id));
      expect(r.s).toBe('CANCELLED');
    });
  });

  describe('cancellation rules & payment-first variant', () => {
    it('lets only one of two concurrent cancels win', async () => {
      const f = await offerFlow();
      const order = (
        await accept(f.patient.access_token, f.offerId).expect(201)
      ).body.data;
      const [a, b] = await Promise.all([
        ctx
          .http()
          .post(`/orders/${order.id}/cancel`)
          .set(bearer(f.patient.access_token))
          .send({ reason: 'Plus besoin' }),
        ctx
          .http()
          .post(`/orders/${order.id}/cancel`)
          .set(bearer(f.patient.access_token))
          .send({ reason: 'Plus besoin' }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect([
        'ORDER_VERSION_CONFLICT',
        'ORDER_INVALID_TRANSITION',
        'ORDER_NOT_CANCELLABLE',
      ]).toContain([a, b].find((x) => x.status === 409)!.body.error.code);
    });

    it('PAYMENT_FIRST: starts in AWAITING_PAYMENT, refunds after capture, needs approval during preparation', async () => {
      await setSetting('payment_before_validation', true);
      try {
        const f = await offerFlow();
        const order = (
          await accept(f.patient.access_token, f.offerId).expect(201)
        ).body.data;
        expect(order).toMatchObject({
          status: 'AWAITING_PAYMENT',
          workflow_variant: 'PAYMENT_FIRST',
          next_actions: ['PAY', 'CANCEL'],
        });
        expect(new Date(order.payment_deadline_at).getTime()).toBeGreaterThan(
          Date.now(),
        );

        // Payment confirmed → automatically to pharmacist validation.
        await sm.transition(order.id, 'PAYMENT_PENDING', SYSTEM_ACTOR);
        const confirmed = await sm.transition(
          order.id,
          'PAYMENT_CONFIRMED',
          SYSTEM_ACTOR,
        );
        await sm.transition(
          confirmed.id,
          'PHARMACIST_VALIDATION_PENDING',
          SYSTEM_ACTOR,
        );
        await ctx
          .http()
          .post(`/pharmacy/orders/${order.id}/validate`)
          .set(bearer(pharmacist.token))
          .send({ decision: 'APPROVE', confirm: true, note: 'Conforme.' })
          .expect(200);
        const prep = await ctx
          .http()
          .get(`/orders/${order.id}`)
          .set(bearer(f.patient.access_token))
          .expect(200);
        expect(prep.body.data.status).toBe('PREPARING');

        expect(
          (
            await ctx
              .http()
              .post(`/orders/${order.id}/cancel`)
              .set(bearer(f.patient.access_token))
              .send({ reason: 'Changement d’avis' })
              .expect(409)
          ).body.error.code,
        ).toBe('ORDER_CANCEL_REQUIRES_APPROVAL');
        const byPharmacy = await ctx
          .http()
          .post(`/pharmacy/orders/${order.id}/cancel`)
          .set(bearer(pharmacist.token))
          .send({ reason: 'Demande du patient' })
          .expect(200);
        expect(byPharmacy.body.data.status).toBe('REFUND_PENDING');

        // Patient cancel right after capture → refund.
        const g = await offerFlow();
        const o2 = (await accept(g.patient.access_token, g.offerId).expect(201))
          .body.data;
        await sm.transition(o2.id, 'PAYMENT_PENDING', SYSTEM_ACTOR);
        await sm.transition(o2.id, 'PAYMENT_CONFIRMED', SYSTEM_ACTOR);
        const refund = await ctx
          .http()
          .post(`/orders/${o2.id}/cancel`)
          .set(bearer(g.patient.access_token))
          .send({ reason: 'Erreur de commande' })
          .expect(200);
        expect(refund.body.data.status).toBe('REFUND_PENDING');
      } finally {
        await setSetting('payment_before_validation', false);
      }
    });
  });

  describe('timeouts, views, access', () => {
    it('cancels unpaid orders after the deadline and expires late validations', async () => {
      const f = await offerFlow();
      const order = (
        await accept(f.patient.access_token, f.offerId).expect(201)
      ).body.data;
      await ctx
        .http()
        .post(`/pharmacy/orders/${order.id}/validate`)
        .set(bearer(pharmacist.token))
        .send({ decision: 'APPROVE', confirm: true, note: 'Conforme.' })
        .expect(200);
      await ctx.db
        .update(orders)
        .set({ paymentDeadlineAt: new Date(Date.now() - 60_000) })
        .where(eq(orders.id, order.id));
      // Orders left due by earlier runs (shared e2e DB) would make the job slow: move them out of its window.
      await ctx.db
        .update(orders)
        .set({ paymentDeadlineAt: new Date(Date.now() + 86_400_000) })
        .where(
          and(
            eq(orders.status, 'AWAITING_PAYMENT'),
            lt(orders.paymentDeadlineAt, new Date()),
            ne(orders.id, order.id),
          ),
        );
      expect(
        await ctx.app.get(OrdersService).cancelUnpaid(),
      ).toBeGreaterThanOrEqual(1);
      expect(
        (
          await ctx.db
            .select({ s: orders.status })
            .from(orders)
            .where(eq(orders.id, order.id))
        )[0].s,
      ).toBe('CANCELLED');

      const g = await offerFlow();
      const o2 = (await accept(g.patient.access_token, g.offerId).expect(201))
        .body.data;
      await ctx.db
        .update(orders)
        .set({ statusChangedAt: new Date(Date.now() - 24 * 3600_000) })
        .where(eq(orders.id, o2.id));
      await ctx.db
        .update(orders)
        .set({ statusChangedAt: new Date() })
        .where(
          and(
            eq(orders.status, 'PHARMACIST_VALIDATION_PENDING'),
            lt(orders.statusChangedAt, new Date(Date.now() - 3600_000)),
            ne(orders.id, o2.id),
          ),
        );
      expect(
        await ctx.app.get(OrdersService).expireValidation(),
      ).toBeGreaterThanOrEqual(1);
      const [row] = await ctx.db
        .select()
        .from(orders)
        .where(eq(orders.id, o2.id));
      expect(row).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'pharmacist_validation_timeout',
      });
    }, 180_000);

    it('filters views by role and hides orders from non-parties', async () => {
      const f = await offerFlow();
      const order = (
        await accept(f.patient.access_token, f.offerId).expect(201)
      ).body.data;
      const other = await registerPatient(ctx);
      await ctx
        .http()
        .get(`/orders/${order.id}`)
        .set(bearer(other.access_token))
        .expect(404);
      await ctx
        .http()
        .get(`/pharmacy/orders/${order.id}`)
        .set(bearer(ph2.ownerToken))
        .expect(404);
      const driver = await insertUser(ctx, 'DRIVER');
      const driverToken = await login(ctx, driver.email!);
      expect(
        (
          await ctx
            .http()
            .get(`/orders/${order.id}`)
            .set(bearer(driverToken))
            .expect(403)
        ).body.error.code,
      ).toBe('ROLE_FORBIDDEN');

      const view = await ctx
        .http()
        .get(`/pharmacy/orders/${order.id}`)
        .set(bearer(assistant.token))
        .expect(200);
      expect(view.body.data).toHaveProperty('patient');
      expect(view.body.data).not.toHaveProperty('delivery_address');
      expect(view.body.data).not.toHaveProperty('pharmacy');
      const list = await ctx
        .http()
        .get('/pharmacy/orders?status=PHARMACIST_VALIDATION_PENDING')
        .set(bearer(ph.ownerToken))
        .expect(200);
      expect(list.body.data.map((o: { id: string }) => o.id)).toContain(
        order.id,
      );
    });
  });
});
