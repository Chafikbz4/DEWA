import { and, eq } from 'drizzle-orm';
import {
  deliveries,
  deliveryCompanies,
  deliveryFeeRules,
  deliveryStatusHistory,
  deliveryZones,
  drivers,
  notifications,
  orders,
  payments,
  platformSettings,
  refunds,
  users,
} from '../src/database/schema';
import { findForbiddenKeys } from '../src/modules/delivery/delivery-privacy';
import { SettingsService } from '../src/modules/settings/settings.service';
import {
  addStaff,
  bearer,
  CONSENTS,
  createAddress,
  createPharmacy,
  createTestApp,
  enablePolicy,
  insertUser,
  isolatedCommune,
  login,
  PASSWORD,
  PharmacyFixture,
  registerPatient,
  TestCtx,
  uniquePhone,
  uploadFile,
  waitFor,
} from './utils';

const MEDICINE = 'Ventoline';

describe('Delivery domain (e2e)', () => {
  let ctx: TestCtx;
  let area: { id: number; wilayaId: number };
  let ph: PharmacyFixture;
  let pharmacist: { userId: string; token: string };

  const setSetting = async (key: string, value: unknown) => {
    await ctx.db
      .update(platformSettings)
      .set({ value })
      .where(eq(platformSettings.key, key));
    ctx.app.get(SettingsService).invalidate();
  };

  /** Every driver / company response goes through this scan. */
  const leaks: string[] = [];
  const scan = <T extends { body: unknown }>(
    res: T,
    secrets: string[] = [],
  ) => {
    const text = JSON.stringify(res.body);
    leaks.push(...findForbiddenKeys(res.body));
    for (const s of [MEDICINE, ...secrets])
      if (text.includes(s)) leaks.push(`value:${s}`);
    return res;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    area = await isolatedCommune(ctx);
    await enablePolicy(ctx, 'PRESCRIPTION', { delivery: true, payment: true });
    await setSetting('delivery_enabled', true);
    ph = await createPharmacy(ctx, {
      wilayaId: area.wilayaId,
      communeId: area.id,
      lat: 36.75,
      lng: 3.05,
      delivery: true,
    });
    pharmacist = await addStaff(ctx, ph.pharmacyId, 'PHARMACIST');
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

  async function createDriver(
    opts: { verified?: boolean; companyId?: string; available?: boolean } = {},
  ) {
    const verified = opts.verified ?? true;
    const phone = uniquePhone();
    const u = await insertUser(ctx, 'DRIVER', {
      phone,
      status: verified ? 'ACTIVE' : 'PENDING_VERIFICATION',
    });
    const [d] = await ctx.db
      .insert(drivers)
      .values({
        userId: u.id,
        companyId: opts.companyId ?? null,
        firstName: 'Karim',
        lastName: 'Livreur',
        vehicleType: 'MOTORCYCLE',
        plateNumber: '01234-116-16',
        status: verified ? 'VERIFIED' : 'PENDING_VERIFICATION',
        isAvailable: opts.available ?? verified,
        currentLatitude: 36.751,
        currentLongitude: 3.051,
        lastLocationAt: new Date(Date.now() - 120_000),
      })
      .returning();
    return {
      userId: u.id,
      driverId: d.id,
      phone,
      token: await login(ctx, u.email!),
    };
  }

  /** A paid delivery order the pharmacy just marked READY → AVAILABLE job. */
  async function readyDeliveryOrder() {
    const patient = await registerPatient(ctx);
    const addressId = await createAddress(
      ctx,
      patient.access_token,
      area.wilayaId,
      area.id,
      36.77,
      3.05,
    );
    const fileId = await uploadFile(ctx, patient.access_token, 'PRESCRIPTION');
    const req = (
      await ctx
        .http()
        .post('/requests')
        .set(bearer(patient.access_token))
        .send({
          request_type: 'PRESCRIPTION',
          file_ids: [fileId],
          address_id: addressId,
          delivery_wanted: true,
          consent_to_share: true,
          pharmacy_ids: [ph.pharmacyId],
          items: [{ raw_name: MEDICINE, quantity: 1 }],
        })
        .expect(201)
    ).body.data;
    const offer = (
      await ctx
        .http()
        .post(`/pharmacy/requests/${req.id}/offers`)
        .set(bearer(pharmacist.token))
        .send({
          items: [
            {
              request_item_id: req.items[0].id,
              name: `${MEDICINE} 100µg`,
              quantity_offered: 1,
              unit_price_centimes: 50000,
              availability: 'AVAILABLE',
            },
          ],
          delivery_available: true,
        })
        .expect(201)
    ).body.data;
    await ctx
      .http()
      .post(`/pharmacy/offers/${offer.id}/send`)
      .set(bearer(pharmacist.token))
      .expect(200);
    const order = (
      await ctx
        .http()
        .post(`/offers/${offer.id}/accept`)
        .set(bearer(patient.access_token))
        .send({ fulfillment_type: 'DELIVERY' })
        .expect(201)
    ).body.data;
    await ctx
      .http()
      .post(`/pharmacy/orders/${order.id}/validate`)
      .set(bearer(pharmacist.token))
      .send({ decision: 'APPROVE', confirm: true, note: 'Conforme.' })
      .expect(200);
    const pay = await ctx
      .http()
      .post(`/orders/${order.id}/pay`)
      .set(bearer(patient.access_token))
      .set('Idempotency-Key', `k-${order.id}`)
      .expect(201);
    const [p] = await ctx.db
      .select({ poid: payments.providerOrderId })
      .from(payments)
      .where(eq(payments.id, pay.body.data.payment_id));
    await ctx
      .http()
      .post(`/payments/mock/${p.poid}/simulate`)
      .send({ result: 'PAID' })
      .expect(200);
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
    const [d] = await ctx.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.orderId, order.id));
    return {
      patient,
      orderId: order.id as string,
      deliveryId: d.id,
      fileId,
      requestItemId: req.items[0].id as string,
      fee: order.delivery_fee_centimes as number,
    };
  }

  const pickupCode = async (orderId: string) =>
    (
      await ctx
        .http()
        .post(`/pharmacy/orders/${orderId}/delivery/pickup-code`)
        .set(bearer(pharmacist.token))
        .expect(200)
    ).body.data.pickup_code as string;
  const deliveryCode = async (token: string, orderId: string) =>
    (
      await ctx
        .http()
        .post(`/orders/${orderId}/delivery/code`)
        .set(bearer(token))
        .expect(200)
    ).body.data.delivery_code as string;
  const orderStatus = async (id: string) =>
    (
      await ctx.db
        .select({ s: orders.status })
        .from(orders)
        .where(eq(orders.id, id))
    )[0].s;
  const job = (token: string, id: string, action: string, body: object = {}) =>
    ctx
      .http()
      .post(`/delivery/jobs/${id}/${action}`)
      .set(bearer(token))
      .send(body);

  it('registers companies and independent drivers as PENDING_VERIFICATION', async () => {
    const base = {
      password: PASSWORD,
      first_name: 'Samir',
      last_name: 'Transport',
      preferred_language: 'fr',
      consents: CONSENTS,
    };
    const companyPhone = uniquePhone();
    await ctx
      .http()
      .post('/delivery/register')
      .send({
        ...base,
        phone: companyPhone,
        account_type: 'COMPANY',
        company: { name: 'Express E2E' },
      })
      .expect(202);
    const driverPhone = uniquePhone();
    await ctx
      .http()
      .post('/delivery/register')
      .send({
        ...base,
        phone: driverPhone,
        account_type: 'DRIVER',
        vehicle_type: 'CAR',
      })
      .expect(202);
    const bad = await ctx
      .http()
      .post('/delivery/register')
      .send({ ...base, phone: uniquePhone(), account_type: 'DRIVER' })
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    const [cu] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.phone, companyPhone));
    const [company] = await ctx.db
      .select()
      .from(deliveryCompanies)
      .where(eq(deliveryCompanies.adminUserId, cu.id));
    expect(company).toMatchObject({
      name: 'Express E2E',
      status: 'PENDING_VERIFICATION',
    });
    const [du] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.phone, driverPhone));
    const [driver] = await ctx.db
      .select()
      .from(drivers)
      .where(eq(drivers.userId, du.id));
    expect(driver).toMatchObject({
      status: 'PENDING_VERIFICATION',
      vehicleType: 'CAR',
      companyId: null,
    });
  });

  it('creates an AVAILABLE job with an opaque label and hashed codes; unverified drivers see no jobs', async () => {
    const o = await readyDeliveryOrder();
    const [d] = await ctx.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, o.deliveryId));
    expect(d).toMatchObject({
      status: 'AVAILABLE',
      deliveryFeeCentimes: o.fee,
    });
    expect(d.packageLabel).toMatch(/^PKG-[A-Z2-9]{6}$/);
    expect(d.pickupCodeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(d.deliveryCodeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(d.dropoffSnapshot)).not.toContain(MEDICINE);
    expect(d.packageLabel).not.toContain(MEDICINE);
    // Codes are sent encrypted (one-time) to the patient and the pharmacy.
    await waitFor(
      async () =>
        (
          await ctx.db
            .select()
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, o.patient.user.id),
                eq(notifications.type, 'DELIVERY_CODE'),
              ),
            )
        ).length,
    );
    await waitFor(
      async () =>
        (
          await ctx.db
            .select()
            .from(notifications)
            .where(
              and(
                eq(notifications.userId, pharmacist.userId),
                eq(notifications.type, 'PICKUP_CODE'),
              ),
            )
        ).length,
    );

    const pending = await createDriver({ verified: false });
    expect(
      (
        await ctx
          .http()
          .get('/delivery/jobs/available')
          .set(bearer(pending.token))
          .expect(403)
      ).body.error.code,
    ).toBe('ACCOUNT_PENDING_VERIFICATION');
    scan(
      await ctx
        .http()
        .get('/delivery/me')
        .set(bearer(pending.token))
        .expect(200),
    );
    // Verified driver of an unverified company: still no jobs.
    const owner = await insertUser(ctx, 'DELIVERY_COMPANY_ADMIN');
    const [c] = await ctx.db
      .insert(deliveryCompanies)
      .values({ name: 'Pending Co', adminUserId: owner.id })
      .returning();
    const companyDriver = await createDriver({ companyId: c.id });
    expect(
      (
        await ctx
          .http()
          .get('/delivery/jobs/available')
          .set(bearer(companyDriver.token))
          .expect(403)
      ).body.error.code,
    ).toBe('DRIVER_NOT_VERIFIED');

    const driver = await createDriver();
    const board = scan(
      await ctx
        .http()
        .get('/delivery/jobs/available?radius_km=50')
        .set(bearer(driver.token))
        .expect(200),
      [o.fileId, o.requestItemId],
    );
    const card = board.body.data.find(
      (j: { id: string }) => j.id === o.deliveryId,
    );
    expect(card).toMatchObject({
      package_label: d.packageLabel,
      delivery_fee_centimes: o.fee,
      destination_area: { commune_id: area.id },
    });
    expect(card.distance_to_pickup_km).toBeLessThan(5);
    expect(card).not.toHaveProperty('dropoff');
    expect(JSON.stringify(card)).not.toContain('5 Rue Patient');
  });

  it('lets exactly one driver win a simultaneous accept', async () => {
    const o = await readyDeliveryOrder();
    const [a, b] = await Promise.all([createDriver(), createDriver()]);
    const results = await Promise.all([
      job(a.token, o.deliveryId, 'accept'),
      job(b.token, o.deliveryId, 'accept'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(loser.body.error.code).toBe('DELIVERY_ALREADY_TAKEN');
    const winner = results.find((r) => r.status === 200)!;
    scan(winner, [o.fileId, o.requestItemId]);
    expect(winner.body.data.dropoff.address).toContain('5 Rue Patient');
    expect(await orderStatus(o.orderId)).toBe('DELIVERY_ASSIGNED');
    const history = await ctx.db
      .select()
      .from(deliveryStatusHistory)
      .where(
        and(
          eq(deliveryStatusHistory.deliveryId, o.deliveryId),
          eq(deliveryStatusHistory.toStatus, 'ASSIGNED'),
        ),
      );
    expect(history).toHaveLength(1);
    // The loser cannot act on the job.
    expect(
      (
        await job(
          results.indexOf(loser) === 0 ? a.token : b.token,
          o.deliveryId,
          'confirm-pickup',
          { pickup_code: '000000' },
        ).expect(404)
      ).body.error.code,
    ).toBe('DELIVERY_NOT_FOUND');
  });

  it('delivers with codes: wrong attempts, lockout, proof required, live tracking, earnings', async () => {
    const o = await readyDeliveryOrder();
    const driver = await createDriver();
    scan(await job(driver.token, o.deliveryId, 'accept').expect(200));

    const code = await pickupCode(o.orderId);
    const wrong = code === '111111' ? '222222' : '111111';
    const bad = await job(driver.token, o.deliveryId, 'confirm-pickup', {
      pickup_code: wrong,
    }).expect(400);
    expect(bad.body.error).toMatchObject({
      code: 'DELIVERY_CODE_INVALID',
      details: { attempts_remaining: 4 },
    });
    scan(
      await job(driver.token, o.deliveryId, 'confirm-pickup', {
        pickup_code: code,
      }).expect(200),
    );
    expect(await orderStatus(o.orderId)).toBe('PICKED_UP');

    // Tracking: no live position before OUT_FOR_DELIVERY.
    expect(
      (
        await ctx
          .http()
          .get(`/orders/${o.orderId}/delivery`)
          .set(bearer(o.patient.access_token))
          .expect(200)
      ).body.data.live_location,
    ).toBeNull();
    const started = scan(
      await job(driver.token, o.deliveryId, 'start', {
        eta_minutes: 20,
      }).expect(200),
    );
    expect(started.body.data.estimated_arrival_at).not.toBeNull();
    await ctx
      .http()
      .patch('/delivery/me/location')
      .set(bearer(driver.token))
      .send({ latitude: 36.76, longitude: 3.052 })
      .expect(200);
    const throttled = await ctx
      .http()
      .patch('/delivery/me/location')
      .set(bearer(driver.token))
      .send({ latitude: 36.761, longitude: 3.052 })
      .expect(429);
    expect(throttled.body.error.code).toBe('DELIVERY_LOCATION_THROTTLED');
    const track = await ctx
      .http()
      .get(`/orders/${o.orderId}/delivery`)
      .set(bearer(o.patient.access_token))
      .expect(200);
    expect(track.body.data).toMatchObject({
      status: 'OUT_FOR_DELIVERY',
      driver: { first_name: 'Karim', vehicle_type: 'MOTORCYCLE' },
      live_location: { latitude: 36.76, longitude: 3.052 },
    });
    expect(track.body.data.driver).not.toHaveProperty('last_name');

    // DELIVERED is impossible without exactly one valid proof.
    expect(
      (
        await job(driver.token, o.deliveryId, 'confirm-delivery', {}).expect(
          400,
        )
      ).body.error.code,
    ).toBe('DELIVERY_PROOF_REQUIRED');
    const photo = await uploadFile(ctx, driver.token, 'PROOF_OF_DELIVERY');
    expect(
      (
        await job(driver.token, o.deliveryId, 'confirm-delivery', {
          photo_file_id: photo,
        }).expect(400)
      ).body.error.code,
    ).toBe('VALIDATION_FAILED');
    expect(
      (
        await job(driver.token, o.deliveryId, 'confirm-delivery', {
          delivery_code: '123456',
          photo_file_id: photo,
          photo_has_no_face: true,
        }).expect(400)
      ).body.error.code,
    ).toBe('DELIVERY_PROOF_REQUIRED');
    const foreign = await uploadFile(
      ctx,
      o.patient.access_token,
      'PRESCRIPTION',
    );
    expect(
      (
        await job(driver.token, o.deliveryId, 'confirm-delivery', {
          signature_file_id: foreign,
        }).expect(400)
      ).body.error.code,
    ).toBe('FILE_INVALID_FOR_USE');

    // Wrong OTP 5 times → locked, even the right code is refused until the patient regenerates it.
    const realCode = await deliveryCode(o.patient.access_token, o.orderId);
    const nope = realCode === '999999' ? '888888' : '999999';
    for (let i = 4; i >= 1; i--) {
      // remaining after each wrong attempt: 4, 3, 2, 1 → the 5th attempt locks
      const r = await job(driver.token, o.deliveryId, 'confirm-delivery', {
        delivery_code: nope,
      }).expect(400);
      expect(r.body.error.details.attempts_remaining).toBe(i);
    }
    expect(
      (
        await job(driver.token, o.deliveryId, 'confirm-delivery', {
          delivery_code: nope,
        }).expect(429)
      ).body.error.code,
    ).toBe('DELIVERY_CODE_LOCKED');
    expect(
      (
        await job(driver.token, o.deliveryId, 'confirm-delivery', {
          delivery_code: realCode,
        }).expect(429)
      ).body.error.code,
    ).toBe('DELIVERY_CODE_LOCKED');
    expect(await orderStatus(o.orderId)).toBe('OUT_FOR_DELIVERY');
    const fresh = await deliveryCode(o.patient.access_token, o.orderId);
    const done = scan(
      await job(driver.token, o.deliveryId, 'confirm-delivery', {
        delivery_code: fresh,
      }).expect(200),
    );
    expect(done.body.data).toMatchObject({
      status: 'DELIVERED',
      proof_type: 'OTP',
    });
    expect(await orderStatus(o.orderId)).toBe('DELIVERED');

    const history = scan(
      await ctx
        .http()
        .get('/delivery/history')
        .set(bearer(driver.token))
        .expect(200),
    );
    expect(history.body.data[0]).toMatchObject({
      id: o.deliveryId,
      status: 'DELIVERED',
      driver_payout_centimes: o.fee,
    });
    const earnings = scan(
      await ctx
        .http()
        .get('/delivery/earnings')
        .set(bearer(driver.token))
        .expect(200),
    );
    expect(earnings.body.data).toMatchObject({
      total_deliveries: 1,
      total_payout_centimes: o.fee,
      records_only: true,
    });
  });

  it('releases a job with a reason, within the daily limit', async () => {
    const o = await readyDeliveryOrder();
    const driver = await createDriver();
    await job(driver.token, o.deliveryId, 'accept').expect(200);
    expect(
      (await job(driver.token, o.deliveryId, 'release', {}).expect(400)).body
        .error.code,
    ).toBe('VALIDATION_FAILED');
    const rel = await job(driver.token, o.deliveryId, 'release', {
      reason: 'Crevaison',
    }).expect(200);
    expect(rel.body.data).toMatchObject({ status: 'AVAILABLE' });
    expect(await orderStatus(o.orderId)).toBe('READY_FOR_PICKUP');
    const [d] = await ctx.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, o.deliveryId));
    expect(d).toMatchObject({ status: 'AVAILABLE', driverId: null });

    await setSetting('delivery_max_releases_per_day', 1);
    try {
      await job(driver.token, o.deliveryId, 'accept').expect(200);
      expect(
        (
          await job(driver.token, o.deliveryId, 'release', {
            reason: 'Encore',
          }).expect(429)
        ).body.error.code,
      ).toBe('DELIVERY_RELEASE_LIMIT_REACHED');
    } finally {
      await setSetting('delivery_max_releases_per_day', 3);
    }
    // Picked-up parcels cannot be released.
    await job(driver.token, o.deliveryId, 'confirm-pickup', {
      pickup_code: await pickupCode(o.orderId),
    }).expect(200);
    expect(
      (
        await job(driver.token, o.deliveryId, 'release', {
          reason: 'Trop loin',
        }).expect(409)
      ).body.error.code,
    ).toBe('DELIVERY_INVALID_TRANSITION');
  });

  it('handles a failed delivery: return to the pharmacy then automatic refund request', async () => {
    const o = await readyDeliveryOrder();
    const driver = await createDriver();
    await job(driver.token, o.deliveryId, 'accept').expect(200);
    await job(driver.token, o.deliveryId, 'confirm-pickup', {
      pickup_code: await pickupCode(o.orderId),
    }).expect(200);
    await job(driver.token, o.deliveryId, 'start').expect(200);
    const failed = scan(
      await job(driver.token, o.deliveryId, 'fail', {
        reason: 'Patient absent',
        attempts: 2,
      }).expect(200),
    );
    expect(failed.body.data).toMatchObject({
      status: 'FAILED',
      delivery_attempts: 2,
      failure_reason: 'Patient absent',
    });
    expect(await orderStatus(o.orderId)).toBe('FAILED');
    expect(
      (
        await job(driver.token, o.deliveryId, 'confirm-delivery', {
          delivery_code: '123456',
        }).expect(409)
      ).body.error.code,
    ).toBe('DELIVERY_INVALID_TRANSITION');

    // Still in "active" until the pharmacy confirms the parcel is back.
    const active = scan(
      await ctx
        .http()
        .get('/delivery/jobs/active')
        .set(bearer(driver.token))
        .expect(200),
    );
    expect(active.body.data.map((j: { id: string }) => j.id)).toContain(
      o.deliveryId,
    );
    const back = scan(
      await job(driver.token, o.deliveryId, 'confirm-return').expect(200),
    );
    expect(back.body.data.returned_by_driver_at).not.toBeNull();

    const confirmed = await ctx
      .http()
      .post(`/pharmacy/orders/${o.orderId}/delivery/confirm-return`)
      .set(bearer(pharmacist.token))
      .expect(200);
    expect(confirmed.body.data).toMatchObject({
      status: 'RETURNED',
      delivery_attempts: 2,
    });
    expect(confirmed.body.data.return_confirmed_at).not.toBeNull();
    expect(await orderStatus(o.orderId)).toBe('REFUND_PENDING');
    const [refund] = await ctx.db
      .select()
      .from(refunds)
      .where(eq(refunds.orderId, o.orderId));
    expect(refund).toMatchObject({ status: 'REQUESTED' });
    await ctx
      .http()
      .post(`/pharmacy/orders/${o.orderId}/delivery/confirm-return`)
      .set(bearer(pharmacist.token))
      .expect(409);
  });

  it('lets a verified company invite drivers, see them and report activity', async () => {
    const admin = await insertUser(ctx, 'DELIVERY_COMPANY_ADMIN');
    const [company] = await ctx.db
      .insert(deliveryCompanies)
      .values({ name: 'Rapide E2E', adminUserId: admin.id, status: 'VERIFIED' })
      .returning();
    const adminToken = await login(ctx, admin.email!);
    const driver = await createDriver();
    const inv = scan(
      await ctx
        .http()
        .post('/delivery/company/invitations')
        .set(bearer(adminToken))
        .send({ phone: driver.phone })
        .expect(201),
    );
    expect(inv.body.data.status).toBe('PENDING');
    const token = ctx.sms
      .lastTo(driver.phone)!
      .body.match(/: ([A-Za-z0-9_-]{40,})/)![1];
    // Somebody else cannot use the token.
    const other = await createDriver();
    expect(
      (
        await ctx
          .http()
          .post('/delivery/invitations/accept')
          .set(bearer(other.token))
          .send({ token })
          .expect(400)
      ).body.error.code,
    ).toBe('DELIVERY_INVITATION_INVALID');
    const joined = scan(
      await ctx
        .http()
        .post('/delivery/invitations/accept')
        .set(bearer(driver.token))
        .send({ token })
        .expect(200),
    );
    expect(joined.body.data.company).toMatchObject({
      id: company.id,
      status: 'VERIFIED',
    });

    const o = await readyDeliveryOrder();
    await job(driver.token, o.deliveryId, 'accept').expect(200);
    await job(driver.token, o.deliveryId, 'confirm-pickup', {
      pickup_code: await pickupCode(o.orderId),
    }).expect(200);
    await job(driver.token, o.deliveryId, 'start').expect(200);
    await job(driver.token, o.deliveryId, 'confirm-delivery', {
      delivery_code: await deliveryCode(o.patient.access_token, o.orderId),
    }).expect(200);

    const list = scan(
      await ctx
        .http()
        .get('/delivery/company/drivers')
        .set(bearer(adminToken))
        .expect(200),
    );
    expect(list.body.data.map((d: { id: string }) => d.id)).toEqual([
      driver.driverId,
    ]);
    const report = scan(
      await ctx
        .http()
        .get('/delivery/company/reports')
        .set(bearer(adminToken))
        .expect(200),
      [o.fileId],
    );
    expect(report.body.data).toMatchObject({
      delivered: 1,
      failed: 0,
      success_rate: 100,
      delivery_fees_centimes: o.fee,
    });
    expect(report.body.data.drivers[0]).toMatchObject({
      driver_id: driver.driverId,
      name: 'Karim L.',
      delivered: 1,
    });
    scan(
      await ctx
        .http()
        .get('/delivery/company')
        .set(bearer(adminToken))
        .expect(200),
    );

    // The parcel is delivered, so the driver can be removed.
    await ctx
      .http()
      .delete(`/delivery/company/drivers/${driver.driverId}`)
      .set(bearer(adminToken))
      .expect(200);
    // Non-admin roles are refused.
    expect(
      (
        await ctx
          .http()
          .get('/delivery/company/drivers')
          .set(bearer(driver.token))
          .expect(403)
      ).body.error.code,
    ).toBe('ROLE_FORBIDDEN');
    expect(
      (
        await ctx
          .http()
          .get('/delivery/jobs/available')
          .set(bearer(o.patient.access_token))
          .expect(403)
      ).body.error.code,
    ).toBe('ROLE_FORBIDDEN');
  });

  it('never served a forbidden field or medical value to drivers / companies', () => {
    expect(leaks).toEqual([]);
  });
});
