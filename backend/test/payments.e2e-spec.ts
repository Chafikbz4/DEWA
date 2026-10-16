import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  commissionRules,
  orders,
  paymentEvents,
  paymentReconciliationIssues,
  payments,
  receipts,
  refunds,
} from '../src/database/schema';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { MockPaymentProvider } from '../src/modules/payments/providers/mock-payment.provider';
import { PAYMENT_PROVIDER } from '../src/modules/payments/providers/payment-provider';
import {
  addStaff,
  bearer,
  createAddress,
  createPharmacy,
  createTestApp,
  enablePolicy,
  insertUser,
  isolatedCommune,
  loginAdmin,
  PharmacyFixture,
  registerPatient,
  TestCtx,
  uploadFile,
  grantAdminRoles,
} from './utils';

describe('Payments, refunds, receipts, settlements (e2e)', () => {
  let ctx: TestCtx;
  let area: { id: number; wilayaId: number };
  let ph: PharmacyFixture;
  let pharmacist: { userId: string; token: string };
  let mock: MockPaymentProvider;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    mock = ctx.app.get(PAYMENT_PROVIDER);
    area = await isolatedCommune(ctx);
    await enablePolicy(ctx, 'PRESCRIPTION', { payment: true });
    ph = await createPharmacy(ctx, {
      wilayaId: area.wilayaId,
      communeId: area.id,
    });
    pharmacist = await addStaff(ctx, ph.pharmacyId, 'PHARMACIST');
    const admin = await insertUser(ctx, 'ADMIN');
    await grantAdminRoles(ctx, admin.id, ['FINANCE_ADMIN']);
    adminToken = (await loginAdmin(ctx, admin.email!)).access;
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  /** Patient with an order in AWAITING_PAYMENT (validation-first). */
  async function payableOrder() {
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
        items: [
          { raw_name: 'Ventoline', quantity: 2 },
          { raw_name: 'Spray nasal', quantity: 1 },
        ],
      })
      .expect(201);
    const req = r.body.data;
    const o = await ctx
      .http()
      .post(`/pharmacy/requests/${req.id}/offers`)
      .set(bearer(pharmacist.token))
      .send({
        items: [
          {
            request_item_id: req.items[0].id,
            name: 'Ventoline',
            quantity_offered: 2,
            unit_price_centimes: 50000,
            availability: 'AVAILABLE',
          },
          {
            request_item_id: req.items[1].id,
            name: 'Spray nasal',
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
      .post(`/pharmacy/offers/${o.body.data.id}/send`)
      .set(bearer(pharmacist.token))
      .expect(200);
    const order = (
      await ctx
        .http()
        .post(`/offers/${o.body.data.id}/accept`)
        .set(bearer(p.access_token))
        .send({ fulfillment_type: 'PICKUP' })
        .expect(201)
    ).body.data;
    await ctx
      .http()
      .post(`/pharmacy/orders/${order.id}/validate`)
      .set(bearer(pharmacist.token))
      .send({ decision: 'APPROVE', confirm: true, note: 'Conforme.' })
      .expect(200);
    return {
      patient: p,
      orderId: order.id as string,
      total: order.total_centimes as number,
    };
  }

  const pay = (token: string, orderId: string, key = randomUUID()) =>
    ctx
      .http()
      .post(`/orders/${orderId}/pay`)
      .set(bearer(token))
      .set('Idempotency-Key', key);

  const providerOrderIdOf = async (paymentId: string) =>
    (
      await ctx.db
        .select({ id: payments.providerOrderId })
        .from(payments)
        .where(eq(payments.id, paymentId))
    )[0].id!;

  const orderStatus = async (orderId: string) =>
    (
      await ctx.db
        .select({ s: orders.status })
        .from(orders)
        .where(eq(orders.id, orderId))
    )[0].s;

  it('shows a transparent checkout and pays end-to-end with server-side verification + receipt', async () => {
    const { patient, orderId, total } = await payableOrder();
    const checkout = await ctx
      .http()
      .get(`/orders/${orderId}/checkout`)
      .set(bearer(patient.access_token))
      .expect(200);
    expect(checkout.body.data).toMatchObject({
      payable: true,
      medicines_subtotal_centimes: 130000,
      delivery_fee_centimes: 0,
      total_centimes: total,
      payment_provider: 'MOCK',
    });
    expect(checkout.body.data.lines).toHaveLength(2);

    expect(
      (
        await ctx
          .http()
          .post(`/orders/${orderId}/pay`)
          .set(bearer(patient.access_token))
          .expect(400)
      ).body.error.code,
    ).toBe('IDEMPOTENCY_KEY_INVALID');
    const started = await pay(patient.access_token, orderId).expect(201);
    expect(started.body.data).toMatchObject({
      status: 'PENDING',
      amount_centimes: total,
    });
    expect(started.body.data.redirect_url).toContain(
      '/payments/mock/checkout/',
    );
    expect(await orderStatus(orderId)).toBe('PAYMENT_PENDING');

    const poid = await providerOrderIdOf(started.body.data.payment_id);
    const sim = await ctx
      .http()
      .post(`/payments/mock/${poid}/simulate`)
      .send({ result: 'PAID' })
      .expect(200);
    expect(sim.body.data.webhook.result).toBe('verified:CONFIRMED');

    const status = await ctx
      .http()
      .get(`/payments/${started.body.data.payment_id}/status`)
      .set(bearer(patient.access_token))
      .expect(200);
    expect(status.body.data.status).toBe('CONFIRMED');
    expect(status.body.data.verified_server_side_at).not.toBeNull();
    expect(await orderStatus(orderId)).toBe('PAYMENT_CONFIRMED');

    const receipt = await ctx
      .http()
      .get(`/orders/${orderId}/receipt`)
      .set(bearer(patient.access_token))
      .expect(200);
    expect(receipt.body.data.receipt_number).toMatch(/^RCP-\d{4}-\d{6}$/);
    expect(receipt.body.data.total_centimes).toBe(total);
    const pdf = await ctx
      .http()
      .get(`/orders/${orderId}/receipt?format=pdf`)
      .set(bearer(patient.access_token))
      .buffer(true)
      .parse((res, cb) => {
        const c: Buffer[] = [];
        res.on('data', (d: Buffer) => c.push(d));
        res.on('end', () => cb(null, Buffer.concat(c)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('never trusts the client: the return URL and polling only confirm what the provider confirms', async () => {
    const { patient, orderId } = await payableOrder();
    const started = await pay(patient.access_token, orderId).expect(201);
    // Browser comes back "successful" but the bank has not captured anything.
    const back = await ctx
      .http()
      .get(`/payments/return/${started.body.data.payment_id}?status=success`)
      .expect(200);
    expect(back.body.data.status).toBe('PENDING');
    const poll = await ctx
      .http()
      .get(`/payments/${started.body.data.payment_id}/status`)
      .set(bearer(patient.access_token))
      .expect(200);
    expect(poll.body.data.status).toBe('PENDING');
    // A forged webhook claiming success (valid signature, provider still pending) does not confirm either.
    const poid = await providerOrderIdOf(started.body.data.payment_id);
    const body = Buffer.from(
      JSON.stringify({
        event_id: randomUUID(),
        type: 'payment.paid',
        provider_order_id: poid,
      }),
    );
    const hook = await ctx
      .http()
      .post('/payments/webhook/mock')
      .set('x-mock-signature', mock.sign(body))
      .set('Content-Type', 'application/json')
      .send(body.toString())
      .expect(200);
    expect(hook.body.data.result).toBe('verified:PENDING');
    expect(await orderStatus(orderId)).toBe('PAYMENT_PENDING');
  });

  it('rejects unsigned webhooks, ignores replays, and records every event first', async () => {
    const { patient, orderId } = await payableOrder();
    const started = await pay(patient.access_token, orderId).expect(201);
    const poid = await providerOrderIdOf(started.body.data.payment_id);
    mock.simulate(poid, 'PAID');
    const eventId = randomUUID();
    const body = JSON.stringify({
      event_id: eventId,
      type: 'payment.paid',
      provider_order_id: poid,
    });

    const bad = await ctx
      .http()
      .post('/payments/webhook/mock')
      .set('x-mock-signature', 'deadbeef')
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(401);
    expect(bad.body.error.code).toBe('PAYMENT_WEBHOOK_INVALID_SIGNATURE');
    // The forged event was stored and then the real one with the SAME id is a replay → not processed.
    const replay = await ctx
      .http()
      .post('/payments/webhook/mock')
      .set('x-mock-signature', mock.sign(body))
      .set('Content-Type', 'application/json')
      .send(body)
      .expect(200);
    expect(replay.body.data).toMatchObject({ duplicate: true });
    const [ev] = await ctx.db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.providerEventId, `mock:${eventId}`));
    expect(ev).toMatchObject({
      signatureValid: false,
      processingResult: 'rejected:invalid_signature',
    });

    // A fresh, valid event confirms; sending it again is a harmless duplicate.
    const good = JSON.stringify({
      event_id: randomUUID(),
      type: 'payment.paid',
      provider_order_id: poid,
    });
    await ctx
      .http()
      .post('/payments/webhook/mock')
      .set('x-mock-signature', mock.sign(good))
      .set('Content-Type', 'application/json')
      .send(good)
      .expect(200);
    const dup = await ctx
      .http()
      .post('/payments/webhook/mock')
      .set('x-mock-signature', mock.sign(good))
      .set('Content-Type', 'application/json')
      .send(good)
      .expect(200);
    expect(dup.body.data.duplicate).toBe(true);
    expect(await orderStatus(orderId)).toBe('PAYMENT_CONFIRMED');
    expect(
      await ctx.db.select().from(receipts).where(eq(receipts.orderId, orderId)),
    ).toHaveLength(1);
  });

  it('never confirms when the captured amount differs, and flags it for reconciliation', async () => {
    const { patient, orderId, total } = await payableOrder();
    const started = await pay(patient.access_token, orderId).expect(201);
    const poid = await providerOrderIdOf(started.body.data.payment_id);
    await ctx
      .http()
      .post(`/payments/mock/${poid}/simulate`)
      .send({ result: 'PAID', captured_centimes: total - 100 })
      .expect(200);
    const [p] = await ctx.db
      .select()
      .from(payments)
      .where(eq(payments.id, started.body.data.payment_id));
    expect(p).toMatchObject({
      status: 'PENDING',
      failureCode: 'AMOUNT_MISMATCH',
      verifiedServerSideAt: null,
    });
    expect(await orderStatus(orderId)).toBe('PAYMENT_PENDING');
    const issues = await ctx
      .http()
      .get('/admin/payments/reconciliation?kind=AMOUNT_MISMATCH&status=OPEN')
      .set(bearer(adminToken))
      .expect(200);
    const issue = issues.body.data.find(
      (i: { payment_id: string }) => i.payment_id === p.id,
    );
    expect(issue.details).toMatchObject({
      expected: total,
      captured: total - 100,
    });
    await ctx
      .http()
      .post(`/admin/payments/reconciliation/${issue.id}/resolve`)
      .set(bearer(adminToken))
      .send({ note: 'Bank contacted, refund issued manually.' })
      .expect(200);
  });

  it('protects against double pay clicks (same key replayed, concurrent different keys rejected)', async () => {
    const { patient, orderId } = await payableOrder();
    const key = randomUUID();
    const first = await pay(patient.access_token, orderId, key).expect(201);
    const again = await pay(patient.access_token, orderId, key).expect(201);
    expect(again.body.data.payment_id).toBe(first.body.data.payment_id);
    const other = await pay(patient.access_token, orderId).expect(409);
    expect(other.body.error.code).toBe('PAYMENT_ALREADY_IN_PROGRESS');

    const g = await payableOrder();
    const [a, b] = await Promise.all([
      pay(g.patient.access_token, g.orderId),
      pay(g.patient.access_token, g.orderId),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(
      await ctx.db
        .select()
        .from(payments)
        .where(eq(payments.orderId, g.orderId)),
    ).toHaveLength(1);
  });

  it('puts the order back to AWAITING_PAYMENT on declines and provider outages', async () => {
    const { patient, orderId } = await payableOrder();
    mock.failNextInitiate = true;
    expect(
      (await pay(patient.access_token, orderId).expect(502)).body.error.code,
    ).toBe('PAYMENT_PROVIDER_ERROR');
    expect(await orderStatus(orderId)).toBe('AWAITING_PAYMENT');
    const started = await pay(patient.access_token, orderId).expect(201);
    await ctx
      .http()
      .post(
        `/payments/mock/${await providerOrderIdOf(started.body.data.payment_id)}/simulate`,
      )
      .send({ result: 'FAILED' })
      .expect(200);
    expect(await orderStatus(orderId)).toBe('AWAITING_PAYMENT');
    expect(
      (
        await ctx
          .http()
          .get(`/payments/${started.body.data.payment_id}/status`)
          .set(bearer(patient.access_token))
          .expect(200)
      ).body.data.status,
    ).toBe('FAILED');
  });

  it('refunds: full automatic refund on cancellation, partial refunds, admin approval → REFUNDED', async () => {
    const { patient, orderId, total } = await payableOrder();
    const started = await pay(patient.access_token, orderId).expect(201);
    await ctx
      .http()
      .post(
        `/payments/mock/${await providerOrderIdOf(started.body.data.payment_id)}/simulate`,
      )
      .send({ result: 'PAID' })
      .expect(200);

    // Partial refund requested by the pharmacy (one item unavailable after payment).
    const partial = await ctx
      .http()
      .post(`/pharmacy/orders/${orderId}/refund-request`)
      .set(bearer(pharmacist.token))
      .send({ amount_centimes: 30000, reason: 'Spray nasal en rupture' })
      .expect(201);
    expect(partial.body.data).toMatchObject({
      status: 'REQUESTED',
      amount_centimes: 30000,
    });
    const tooMuch = await ctx
      .http()
      .post(`/orders/${orderId}/refund-request`)
      .set(bearer(patient.access_token))
      .send({ amount_centimes: total, reason: 'Tout' })
      .expect(400);
    expect(tooMuch.body.error).toMatchObject({
      code: 'REFUND_AMOUNT_INVALID',
      details: { refundable_centimes: total - 30000 },
    });
    const done = await ctx
      .http()
      .post(`/admin/refunds/${partial.body.data.id}/approve`)
      .set(bearer(adminToken))
      .expect(200);
    expect(done.body.data.status).toBe('COMPLETED');
    expect(await orderStatus(orderId)).toBe('PAYMENT_CONFIRMED');

    // Patient cancels right after capture → automatic refund of the remaining amount.
    const cancelled = await ctx
      .http()
      .post(`/orders/${orderId}/cancel`)
      .set(bearer(patient.access_token))
      .send({ reason: 'Erreur de commande' })
      .expect(200);
    expect(cancelled.body.data.status).toBe('REFUND_PENDING');
    const [auto] = await ctx.db
      .select()
      .from(refunds)
      .where(
        and(eq(refunds.orderId, orderId), eq(refunds.status, 'REQUESTED')),
      );
    expect(auto.amountCentimes).toBe(total - 30000);

    mock.failNextRefund = true;
    expect(
      (
        await ctx
          .http()
          .post(`/admin/refunds/${auto.id}/approve`)
          .set(bearer(adminToken))
          .expect(502)
      ).body.error.code,
    ).toBe('PAYMENT_PROVIDER_ERROR');
    await ctx
      .http()
      .post(`/admin/refunds/${auto.id}/approve`)
      .set(bearer(adminToken))
      .expect(200);
    expect(await orderStatus(orderId)).toBe('REFUNDED');
    const [p] = await ctx.db
      .select({ s: payments.status })
      .from(payments)
      .where(eq(payments.orderId, orderId));
    expect(p.s).toBe('REFUNDED');
    const list = await ctx
      .http()
      .get(`/orders/${orderId}/refunds`)
      .set(bearer(patient.access_token))
      .expect(200);
    expect(list.body.data.map((r: { status: string }) => r.status)).toEqual([
      'COMPLETED',
      'COMPLETED',
    ]);
  });

  it('reconciles pending payments and generates settlement records with commission', async () => {
    const { patient, orderId } = await payableOrder();
    const started = await pay(patient.access_token, orderId).expect(201);
    mock.simulate(
      await providerOrderIdOf(started.body.data.payment_id),
      'PAID',
    );
    await ctx.db
      .update(payments)
      .set({ updatedAt: new Date(Date.now() - 5 * 60_000) })
      .where(eq(payments.id, started.body.data.payment_id));
    await ctx.app.get(PaymentsService).reconcile();
    expect(await orderStatus(orderId)).toBe('PAYMENT_CONFIRMED');

    // Hand over and settle.
    await ctx
      .http()
      .post(`/pharmacy/orders/${orderId}/start-preparing`)
      .set(bearer(pharmacist.token))
      .expect(200);
    await ctx
      .http()
      .post(`/pharmacy/orders/${orderId}/ready`)
      .set(bearer(pharmacist.token))
      .expect(200);
    const code = (
      await ctx
        .http()
        .post(`/orders/${orderId}/collection-code`)
        .set(bearer(patient.access_token))
        .expect(200)
    ).body.data.collection_code;
    await ctx
      .http()
      .post(`/pharmacy/orders/${orderId}/handover`)
      .set(bearer(pharmacist.token))
      .send({ collection_code: code })
      .expect(200);

    await ctx.db.insert(commissionRules).values({
      scope: 'PHARMACY',
      pharmacyId: ph.pharmacyId,
      type: 'PERCENT',
      value: 500,
      isActive: true,
      legalReviewNote: 'E2E only',
    });
    const today = new Date();
    const start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const end = new Date(start.getTime() + 86_400_000);
    await ctx
      .http()
      .post('/admin/settlements/generate')
      .set(bearer(adminToken))
      .send({
        period_start: start.toISOString().slice(0, 10),
        period_end: end.toISOString().slice(0, 10),
      })
      .expect(200);
    const list = await ctx
      .http()
      .get(`/admin/settlements?pharmacy_id=${ph.pharmacyId}`)
      .set(bearer(adminToken))
      .expect(200);
    const s = list.body.data[0];
    expect(s).toMatchObject({
      gross_centimes: 130000,
      commission_centimes: 6500,
      status: 'DRAFT',
      records_only: true,
    });
    expect(s.net_centimes).toBe(130000 - 6500 - s.refunds_centimes);
    await ctx
      .http()
      .post(`/admin/settlements/${s.id}/approve`)
      .set(bearer(adminToken))
      .expect(200);
    await ctx
      .http()
      .post(`/admin/settlements/${s.id}/mark-paid`)
      .set(bearer(adminToken))
      .send({ payout_reference: 'VIR-E2E-1' })
      .expect(200);
    const mine = await ctx
      .http()
      .get('/pharmacy/settlements')
      .set(bearer(ph.ownerToken))
      .expect(200);
    expect(mine.body.data[0]).toMatchObject({
      status: 'PAID',
      payout_reference: 'VIR-E2E-1',
    });
    const issues = await ctx.db
      .select()
      .from(paymentReconciliationIssues)
      .where(eq(paymentReconciliationIssues.orderId, orderId));
    expect(issues.filter((i) => i.kind === 'MISSING_PAYMENT')).toHaveLength(0);
  });
});
