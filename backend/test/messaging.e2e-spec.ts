import { and, eq } from 'drizzle-orm';
import { io, Socket } from 'socket.io-client';
import {
  devices,
  jobDeadLetters,
  notifications,
  platformSettings,
  requests,
} from '../src/database/schema';
import {
  MockPushProvider,
  PUSH_PROVIDER,
} from '../src/modules/messaging-providers/providers';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { SettingsService } from '../src/modules/settings/settings.service';
import {
  addStaff,
  bearer,
  createAddress,
  createPharmacy,
  createTestApp,
  drainJobs,
  enablePolicy,
  insertUser,
  isolatedCommune,
  loginAdmin,
  PharmacyFixture,
  registerPatient,
  TestCtx,
  uploadFile,
  waitFor,
} from './utils';

describe('Messaging, notifications & realtime (e2e)', () => {
  let ctx: TestCtx;
  let area: { id: number; wilayaId: number };
  let ph1: PharmacyFixture;
  let ph2: PharmacyFixture;
  let pharmacist1: { userId: string; token: string };
  let baseUrl: string;
  let push: MockPushProvider;

  const setSetting = async (key: string, value: unknown) => {
    await ctx.db
      .update(platformSettings)
      .set({ value })
      .where(eq(platformSettings.key, key));
    ctx.app.get(SettingsService).invalidate();
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.app.listen(0);
    const address = ctx.app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
    push = ctx.app.get(PUSH_PROVIDER);
    area = await isolatedCommune(ctx);
    await enablePolicy(ctx, 'PRESCRIPTION');
    ph1 = await createPharmacy(ctx, {
      wilayaId: area.wilayaId,
      communeId: area.id,
    });
    ph2 = await createPharmacy(ctx, {
      wilayaId: area.wilayaId,
      communeId: area.id,
    });
    pharmacist1 = await addStaff(ctx, ph1.pharmacyId, 'PHARMACIST');
  });
  afterAll(async () => {
    await setSetting('message_rate_limit_per_minute', 20);
    await ctx.app.close();
  });

  async function requestWithQuestion() {
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
        pharmacy_ids: [ph1.pharmacyId, ph2.pharmacyId],
        items: [{ raw_name: 'Amoxicilline 1g', quantity: 1 }],
      })
      .expect(201);
    const q = await ctx
      .http()
      .post(`/pharmacy/requests/${r.body.data.id}/clarification`)
      .set(bearer(pharmacist1.token))
      .send({ question: 'Quelle est la posologie prescrite ?' })
      .expect(200);
    return {
      patient: p,
      request: r.body.data,
      conversationId: q.body.data.conversation_id as string,
    };
  }

  describe('conversations', () => {
    it('only the patient and the staff of that pharmacy can access a conversation', async () => {
      const { patient, conversationId } = await requestWithQuestion();
      const other = await registerPatient(ctx);
      const admin = await insertUser(ctx, 'ADMIN');
      const { access: adminToken } = await loginAdmin(ctx, admin.email!);

      await ctx
        .http()
        .get(`/conversations/${conversationId}/messages`)
        .set(bearer(patient.access_token))
        .expect(200);
      await ctx
        .http()
        .get(`/conversations/${conversationId}/messages`)
        .set(bearer(ph1.ownerToken))
        .expect(200);
      expect(
        (
          await ctx
            .http()
            .get(`/conversations/${conversationId}/messages`)
            .set(bearer(other.access_token))
            .expect(404)
        ).body.error.code,
      ).toBe('CONVERSATION_NOT_FOUND');
      await ctx
        .http()
        .get(`/conversations/${conversationId}/messages`)
        .set(bearer(ph2.ownerToken))
        .expect(404);
      await ctx
        .http()
        .post(`/conversations/${conversationId}/messages`)
        .set(bearer(ph2.ownerToken))
        .send({ type: 'TEXT', body: 'Bonjour' })
        .expect(404);
      // Admins have no direct access (justified, time-limited grants come with the admin module).
      expect(
        (
          await ctx
            .http()
            .get(`/conversations/${conversationId}/messages`)
            .set(bearer(adminToken))
            .expect(403)
        ).body.error.code,
      ).toBe('ROLE_FORBIDDEN');

      const mine = await ctx
        .http()
        .get('/conversations')
        .set(bearer(patient.access_token))
        .expect(200);
      expect(mine.body.data[0]).toMatchObject({
        id: conversationId,
        unread_count: 1,
        status: 'OPEN',
      });
      expect(mine.body.data[0].pharmacy.id).toBe(ph1.pharmacyId);
    });

    it('clarification answer brings the request back (to OFFER_AVAILABLE if another offer is pending)', async () => {
      const { patient, request, conversationId } = await requestWithQuestion();
      expect(
        (
          await ctx.db
            .select({ s: requests.status })
            .from(requests)
            .where(eq(requests.id, request.id))
        )[0].s,
      ).toBe('CLARIFICATION_REQUIRED');

      // Pharmacies cannot answer on behalf of the patient; patients cannot ask questions.
      expect(
        (
          await ctx
            .http()
            .post(`/conversations/${conversationId}/messages`)
            .set(bearer(ph1.ownerToken))
            .send({ type: 'CLARIFICATION_ANSWER', body: 'x' })
            .expect(403)
        ).body.error.code,
      ).toBe('MESSAGE_TYPE_NOT_ALLOWED');
      await ctx
        .http()
        .post(`/conversations/${conversationId}/messages`)
        .set(bearer(patient.access_token))
        .send({ type: 'CLARIFICATION_QUESTION', body: 'x' })
        .expect(403);

      // Another pharmacy sends an offer meanwhile.
      const offer = await ctx
        .http()
        .post(`/pharmacy/requests/${request.id}/offers`)
        .set(bearer(ph2.ownerToken))
        .send({
          items: [
            {
              request_item_id: request.items[0].id,
              name: 'Amoxicilline 1g',
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
        .set(bearer(ph2.ownerToken))
        .expect(200);
      // A sent offer moves the request to OFFER_AVAILABLE even while a question is open.
      let status = (
        await ctx.db
          .select({ s: requests.status })
          .from(requests)
          .where(eq(requests.id, request.id))
      )[0].s;
      expect(status).toBe('OFFER_AVAILABLE');

      // Pharmacy 1 asks again through the chat → back to CLARIFICATION_REQUIRED.
      await ctx
        .http()
        .post(`/conversations/${conversationId}/messages`)
        .set(bearer(pharmacist1.token))
        .send({
          type: 'CLARIFICATION_QUESTION',
          body: 'Et la durée du traitement ?',
        })
        .expect(201);
      status = (
        await ctx.db
          .select({ s: requests.status })
          .from(requests)
          .where(eq(requests.id, request.id))
      )[0].s;
      expect(status).toBe('CLARIFICATION_REQUIRED');

      await ctx
        .http()
        .post(`/conversations/${conversationId}/messages`)
        .set(bearer(patient.access_token))
        .send({
          type: 'CLARIFICATION_ANSWER',
          body: '7 jours, 3 fois par jour.',
        })
        .expect(201);
      status = (
        await ctx.db
          .select({ s: requests.status })
          .from(requests)
          .where(eq(requests.id, request.id))
      )[0].s;
      expect(status).toBe('OFFER_AVAILABLE');

      // Status changes are recorded as SYSTEM messages (i18n keys).
      const msgs = await waitFor(async () => {
        const res = await ctx
          .http()
          .get(`/conversations/${conversationId}/messages?limit=50`)
          .set(bearer(patient.access_token))
          .expect(200);
        return res.body.data.some(
          (m: { message_type: string }) => m.message_type === 'SYSTEM',
        )
          ? res.body.data
          : null;
      });
      const system = msgs.filter(
        (m: { message_type: string }) => m.message_type === 'SYSTEM',
      );
      expect(system[0].body).toMatch(/^system\./);
      expect(system[0].sender_side).toBe('SYSTEM');
    });

    it('answers with no pending offer go back to AWAITING_PHARMACY_RESPONSE', async () => {
      const { patient, request, conversationId } = await requestWithQuestion();
      await ctx
        .http()
        .post(`/conversations/${conversationId}/messages`)
        .set(bearer(patient.access_token))
        .send({
          type: 'CLARIFICATION_ANSWER',
          body: 'Un comprimé matin et soir.',
        })
        .expect(201);
      const [r] = await ctx.db
        .select({ s: requests.status })
        .from(requests)
        .where(eq(requests.id, request.id));
      expect(r.s).toBe('AWAITING_PHARMACY_RESPONSE');
    });

    it('enforces message safety rules', async () => {
      const { patient, conversationId } = await requestWithQuestion();
      const send = (
        body: Record<string, unknown>,
        token = patient.access_token,
      ) =>
        ctx
          .http()
          .post(`/conversations/${conversationId}/messages`)
          .set(bearer(token))
          .send(body);

      expect(
        (
          await send({
            type: 'TEXT',
            body: 'Appelez-moi au 0661 23 45 67',
          }).expect(422)
        ).body.error.code,
      ).toBe('MESSAGE_CONTAINS_PHONE');
      expect(
        (await send({ type: 'TEXT', body: 'x'.repeat(2001) }).expect(400)).body
          .error.code,
      ).toBe('MESSAGE_TOO_LONG');
      expect(
        (await send({ type: 'TEXT', body: '   ' }).expect(400)).body.error.code,
      ).toBe('MESSAGE_EMPTY');
      expect((await send({ type: 'IMAGE' }).expect(400)).body.error.code).toBe(
        'MESSAGE_EMPTY',
      );
      const prescription = await uploadFile(
        ctx,
        patient.access_token,
        'PRESCRIPTION',
      );
      expect(
        (await send({ type: 'IMAGE', file_id: prescription }).expect(400)).body
          .error.code,
      ).toBe('FILE_INVALID_FOR_USE');

      await setSetting('message_rate_limit_per_minute', 2);
      await send({ type: 'TEXT', body: 'Message 1' }).expect(201);
      await send({ type: 'TEXT', body: 'Message 2' }).expect(201);
      expect(
        (await send({ type: 'TEXT', body: 'Message 3' }).expect(429)).body.error
          .code,
      ).toBe('MESSAGE_RATE_LIMITED');
      await setSetting('message_rate_limit_per_minute', 20);
    });

    it('paginates with a cursor, marks read, and shares attachments only with participants', async () => {
      const { patient, conversationId } = await requestWithQuestion();
      for (let i = 1; i <= 4; i++) {
        await ctx
          .http()
          .post(`/conversations/${conversationId}/messages`)
          .set(bearer(patient.access_token))
          .send({ type: 'TEXT', body: `Msg ${i}` })
          .expect(201);
      }
      const page1 = await ctx
        .http()
        .get(`/conversations/${conversationId}/messages?limit=2`)
        .set(bearer(ph1.ownerToken))
        .expect(200);
      expect(page1.body.data.map((m: { body: string }) => m.body)).toEqual([
        'Msg 4',
        'Msg 3',
      ]);
      const cursor = page1.body.meta.cursor.next_cursor;
      const page2 = await ctx
        .http()
        .get(
          `/conversations/${conversationId}/messages?limit=2&before=${cursor}`,
        )
        .set(bearer(ph1.ownerToken))
        .expect(200);
      expect(page2.body.data.map((m: { body: string }) => m.body)).toEqual([
        'Msg 2',
        'Msg 1',
      ]);

      const read = await ctx
        .http()
        .post(`/conversations/${conversationId}/read`)
        .set(bearer(ph1.ownerToken))
        .expect(200);
      expect(read.body.data.marked_read).toBe(4);

      const fileId = await uploadFile(
        ctx,
        patient.access_token,
        'MESSAGE_ATTACHMENT',
      );
      await ctx
        .http()
        .post(`/conversations/${conversationId}/messages`)
        .set(bearer(patient.access_token))
        .send({ type: 'IMAGE', file_id: fileId })
        .expect(201);
      await ctx
        .http()
        .get(`/files/${fileId}/access-url`)
        .set(bearer(pharmacist1.token))
        .expect(200);
      await ctx
        .http()
        .get(`/files/${fileId}/access-url`)
        .set(bearer(ph2.ownerToken))
        .expect(404);
    });
  });

  describe('notifications', () => {
    it('notifies the patient in their language without medical details, honours preferences, and retries then dead-letters push', async () => {
      const p = await registerPatient(ctx);
      await ctx
        .http()
        .patch('/me')
        .set(bearer(p.access_token))
        .send({ preferred_language: 'ar' })
        .expect(200);
      await ctx.db.insert(devices).values({
        userId: p.user.id,
        deviceIdentifier: `dev-${p.user.id}`,
        platform: 'android',
        pushToken: 'push-token-xyz',
      });
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
          pharmacy_ids: [ph1.pharmacyId],
          items: [{ raw_name: 'Seretide 250', quantity: 1 }],
        })
        .expect(201);

      // Pharmacy staff are told about the new request.
      await waitFor(
        async () =>
          (
            await ctx.db
              .select()
              .from(notifications)
              .where(
                and(
                  eq(notifications.userId, ph1.ownerId),
                  eq(notifications.type, 'REQUEST_RECEIVED'),
                ),
              )
          ).length > 0,
      );

      const offer = await ctx
        .http()
        .post(`/pharmacy/requests/${r.body.data.id}/offers`)
        .set(bearer(ph1.ownerToken))
        .send({
          items: [
            {
              request_item_id: r.body.data.items[0].id,
              name: 'Seretide 250',
              quantity_offered: 1,
              unit_price_centimes: 450000,
              availability: 'AVAILABLE',
            },
          ],
          delivery_available: false,
        })
        .expect(201);
      await ctx
        .http()
        .post(`/pharmacy/offers/${offer.body.data.id}/send`)
        .set(bearer(ph1.ownerToken))
        .expect(200);

      const list = await waitFor(async () => {
        const res = await ctx
          .http()
          .get('/notifications?type=OFFER_RECEIVED')
          .set(bearer(p.access_token))
          .expect(200);
        return res.body.data.length ? res.body : null;
      });
      expect(list.data[0].title).toBe('عرض جديد');
      expect(list.data[0].body).toContain(r.body.data.reference);
      expect(list.data[0].data).toMatchObject({
        request_id: r.body.data.id,
        offer_id: offer.body.data.id,
      });
      expect(list.meta.unread_count).toBeGreaterThan(0);

      await drainJobs(ctx);
      const pushed = await waitFor(async () =>
        push.outbox.find(
          (m) =>
            m.tokens.includes('push-token-xyz') &&
            m.data.type === 'OFFER_RECEIVED',
        ),
      );
      expect(pushed.body).toContain(r.body.data.reference);
      expect(`${pushed.title} ${pushed.body}`).not.toMatch(/Seretide/i);

      await ctx
        .http()
        .post(`/notifications/${list.data[0].id}/read`)
        .set(bearer(p.access_token))
        .expect(200);
      await ctx
        .http()
        .post('/notifications/read-all')
        .set(bearer(p.access_token))
        .expect(200);
      expect(
        (
          await ctx
            .http()
            .get('/notifications?unread=true')
            .set(bearer(p.access_token))
            .expect(200)
        ).body.meta.unread_count,
      ).toBe(0);

      // Muted type → in-app only.
      const prefs = await ctx
        .http()
        .patch('/notifications/preferences')
        .set(bearer(p.access_token))
        .send({ muted_types: ['NEW_MESSAGE'], sms_enabled: false })
        .expect(200);
      expect(prefs.body.data).toMatchObject({
        muted_types: ['NEW_MESSAGE'],
        sms_enabled: false,
        push_enabled: true,
      });
    });

    it('retries failed push deliveries and records a dead letter', async () => {
      const p = await registerPatient(ctx);
      await ctx.db.insert(devices).values({
        userId: p.user.id,
        deviceIdentifier: `dev2-${p.user.id}`,
        platform: 'ios',
        pushToken: 'push-token-dead',
      });
      push.failNext = 5; // = attempts
      await ctx.app.get(NotificationsService).notify({
        userIds: [p.user.id],
        type: 'OFFER_RECEIVED',
        params: { reference: 'RX-TEST' },
      });
      await drainJobs(ctx);
      const [n] = await waitFor(async () => {
        const rows = await ctx.db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, p.user.id),
              eq(notifications.channel, 'PUSH'),
            ),
          );
        return rows[0]?.status === 'FAILED' ? rows : null;
      });
      expect(n.attempts).toBe(5);
      expect(n.deadLetteredAt).not.toBeNull();
      expect(n.lastError).toContain('unavailable');
      const dead = await ctx.db
        .select()
        .from(jobDeadLetters)
        .where(eq(jobDeadLetters.jobName, 'notifications.deliver'));
      expect(
        dead.some(
          (d) =>
            (d.payload as { notificationId: string }).notificationId === n.id,
        ),
      ).toBe(true);
      push.failNext = 0;
    });
  });

  describe('realtime', () => {
    const connect = (token?: string) =>
      new Promise<Socket>((resolve, reject) => {
        const s = io(`${baseUrl}/realtime`, {
          auth: token ? { token } : {},
          transports: ['websocket'],
          reconnection: false,
        });
        s.on('connected', () => resolve(s));
        s.on('error', (e: { code: string }) =>
          reject(Object.assign(new Error(e.code), { code: e.code })),
        );
        s.on('connect_error', reject);
      });

    it('rejects unauthenticated sockets and streams message.new / request.status_changed', async () => {
      await expect(connect()).rejects.toMatchObject({
        code: 'AUTH_TOKEN_MISSING',
      });
      await expect(connect('not-a-token')).rejects.toMatchObject({
        code: 'AUTH_TOKEN_INVALID',
      });

      const { patient, request, conversationId } = await requestWithQuestion();
      const patientSocket = await connect(patient.access_token);
      const staffSocket = await connect(pharmacist1.token);
      const gotMessage = new Promise<Record<string, unknown>>((r) =>
        patientSocket.on(
          'message.new',
          (m: Record<string, unknown>) =>
            m.message_type === 'CLARIFICATION_ANSWER' && r(m),
        ),
      );
      const gotStatus = new Promise<Record<string, unknown>>((r) =>
        staffSocket.on(
          'request.status_changed',
          (m: Record<string, unknown>) =>
            m.request_id === request.id &&
            m.to === 'AWAITING_PHARMACY_RESPONSE' &&
            r(m),
        ),
      );

      await ctx
        .http()
        .post(`/conversations/${conversationId}/messages`)
        .set(bearer(patient.access_token))
        .send({ type: 'CLARIFICATION_ANSWER', body: 'Deux fois par jour.' })
        .expect(201);
      expect(await gotMessage).toMatchObject({
        conversation_id: conversationId,
        message_type: 'CLARIFICATION_ANSWER',
      });
      expect(await gotStatus).toMatchObject({
        request_id: request.id,
        from: 'CLARIFICATION_REQUIRED',
        to: 'AWAITING_PHARMACY_RESPONSE',
      });
      staffSocket.disconnect();

      // Logging out closes the socket of that session.
      const closed = new Promise<void>((r) =>
        patientSocket.once('disconnect', () => r()),
      );
      await ctx
        .http()
        .post('/auth/logout')
        .set(bearer(patient.access_token))
        .expect(200);
      await closed;
    });
  });
});
