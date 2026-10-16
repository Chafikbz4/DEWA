import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  ne,
  sql,
  SQL,
} from 'drizzle-orm';
import { AuthUser, PharmacyContext } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import {
  DomainEvent,
  OrderStatusChangedEvent,
} from '../../common/events/domain-events';
import { UnitOfWork } from '../../common/events/unit-of-work';
import { Paginated } from '../../common/http/envelope';
import { IdempotencyService } from '../../common/http/idempotency.service';
import { I18nService, Lang } from '../../common/i18n/i18n.service';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  offerItems,
  offers,
  orderItems,
  orders,
  orderStatusHistory,
  patientProfiles,
  pharmacies,
  pharmacyStock,
  requests,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EligibilityService } from '../requests/eligibility.service';
import { RequestLifecycleService } from '../requests/request-lifecycle.service';
import { SettingsService } from '../settings/settings.service';
import {
  AcceptOfferDto,
  OrdersQueryDto,
  ValidateOrderDto,
} from './dto/orders.dto';
import {
  cancelTarget,
  checkTransition,
  initialStatus,
  OrderStatus,
  WorkflowVariant,
} from './order-state-machine';
import {
  Actor,
  OrderRow,
  OrderStateMachineService,
  SYSTEM_ACTOR,
} from './order-state-machine.service';

const PG_UNIQUE_VIOLATION = '23505';
const MAX_CODE_ATTEMPTS = 5;

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly uow: UnitOfWork,
    private readonly sm: OrderStateMachineService,
    private readonly lifecycle: RequestLifecycleService,
    private readonly eligibility: EligibilityService,
    private readonly settings: SettingsService,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationsService,
    private readonly crypto: CryptoService,
    private readonly i18n: I18nService,
    private readonly audit: AuditService,
  ) {
    // Pickup orders: the patient receives a collection code when the order is ready.
    this.sm.onEnter('READY_FOR_PICKUP', async (ctx, order, from) => {
      if (order.fulfillmentType !== 'PICKUP' || from !== 'PREPARING') return;
      const code = this.crypto.numericCode(6);
      await ctx.tx
        .update(orders)
        .set({
          collectionCodeHash: this.crypto.hmac(`collect|${order.id}|${code}`),
          collectionCodeAttempts: 0,
        })
        .where(eq(orders.id, order.id));
      ctx.emit('order.collection_code', {
        orderId: order.id,
        patientUserId: order.patientUserId,
        reference: order.reference,
        code,
      });
    });
  }

  // -------------------------------------------------------------- loading

  async load(id: string) {
    const [o] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);
    if (!o) throw new AppException('ORDER_NOT_FOUND');
    return o;
  }

  private async loadForPatient(user: AuthUser, id: string) {
    const o = await this.load(id).catch(() => null);
    if (!o || o.patientUserId !== user.id)
      throw new AppException('ORDER_NOT_FOUND');
    return o;
  }

  private async loadForPharmacy(ph: PharmacyContext, id: string) {
    const o = await this.load(id).catch(() => null);
    if (!o || o.pharmacyId !== ph.id) throw new AppException('ORDER_NOT_FOUND');
    return o;
  }

  // --------------------------------------------------------------- accept

  /**
   * Patient accepts a SENT offer: re-checks validity, alternatives, policy and
   * stock, freezes prices into the order, closes the other offers and marks
   * the request OFFER_ACCEPTED. One active order per offer (DB-enforced).
   */
  accept(
    user: AuthUser,
    offerId: string,
    dto: AcceptOfferDto,
    idempotencyKey: string | undefined,
    meta: RequestMeta,
  ) {
    return this.idempotency.run(
      user.id,
      `offer-accept:${offerId}`,
      idempotencyKey,
      dto,
      () => this.doAccept(user, offerId, dto, meta),
    );
  }

  private async doAccept(
    user: AuthUser,
    offerId: string,
    dto: AcceptOfferDto,
    meta: RequestMeta,
  ) {
    const [row] = await this.db
      .select({ o: offers, r: requests })
      .from(offers)
      .innerJoin(requests, eq(requests.id, offers.requestId))
      .where(eq(offers.id, offerId))
      .limit(1);
    if (!row || row.r.patientUserId !== user.id || row.o.status === 'DRAFT')
      throw new AppException('OFFER_NOT_FOUND');
    const { o: offer, r: request } = row;
    if (offer.status !== 'SENT')
      throw new AppException('ORDER_OFFER_NOT_AVAILABLE', {
        offer_status: offer.status,
      });
    if (offer.validUntil && offer.validUntil <= new Date())
      throw new AppException('OFFER_EXPIRED');
    if (
      !['OFFER_AVAILABLE', 'CLARIFICATION_REQUIRED'].includes(request.status)
    ) {
      throw new AppException('ORDER_OFFER_NOT_AVAILABLE', {
        request_status: request.status,
      });
    }

    const items = await this.db
      .select()
      .from(offerItems)
      .where(eq(offerItems.offerId, offerId))
      .orderBy(asc(offerItems.position));
    if (items.some((i) => i.patientApproval === 'PENDING'))
      throw new AppException('ORDER_ALTERNATIVES_PENDING');
    const included = items.filter(
      (i) =>
        i.availability !== 'UNAVAILABLE' &&
        i.quantityOffered > 0 &&
        !(i.isAlternative && i.patientApproval === 'REJECTED'),
    );
    if (!included.length) throw new AppException('ORDER_NOTHING_TO_ORDER');

    // Policy re-check (categories may have been disabled since the offer was sent).
    const medicineIds = included
      .map((i) => i.medicineId)
      .filter((x): x is string => !!x);
    const categories = await this.eligibility
      .categoriesOf(medicineIds)
      .catch(() => new Map());
    const policies = await this.eligibility.enabledPolicies([
      ...new Set(categories.values()),
      ...(request.requestType === 'PRODUCT' ? [] : ['PRESCRIPTION' as const]),
    ]);
    const cats = [
      ...new Set([
        ...categories.values(),
        ...(request.requestType === 'PRODUCT' ? [] : ['PRESCRIPTION']),
      ]),
    ];
    const restricted = cats.filter(
      (c) => !policies.get(c)?.allowedOnlineRequest,
    );
    if (restricted.length)
      throw new AppException('REQUEST_CATEGORY_RESTRICTED', {
        categories: restricted,
      });
    if (dto.fulfillment_type === 'DELIVERY') {
      const deliveryOk =
        offer.deliveryAvailable &&
        request.deliveryWanted &&
        (await this.settings.get('delivery_enabled')) &&
        cats.every((c) => policies.get(c)?.allowedDelivery);
      if (!deliveryOk) throw new AppException('ORDER_DELIVERY_NOT_AVAILABLE');
    }

    // Stock re-check: an item marked OUT_OF_STOCK since the offer blocks acceptance.
    if (medicineIds.length) {
      const out = await this.db
        .select({ medicineId: pharmacyStock.medicineId })
        .from(pharmacyStock)
        .where(
          and(
            eq(pharmacyStock.pharmacyId, offer.pharmacyId),
            inArray(pharmacyStock.medicineId, medicineIds),
            eq(pharmacyStock.stockStatus, 'OUT_OF_STOCK'),
          ),
        );
      if (out.length)
        throw new AppException('ORDER_ITEM_OUT_OF_STOCK', {
          medicine_ids: out.map((x) => x.medicineId),
        });
    }

    const variant: WorkflowVariant = (await this.settings.get(
      'payment_before_validation',
    ))
      ? 'PAYMENT_FIRST'
      : 'VALIDATION_FIRST';
    const status = initialStatus(variant);
    const subtotal = included.reduce((s, i) => s + i.lineTotalCentimes, 0);
    const deliveryFee =
      dto.fulfillment_type === 'DELIVERY' ? offer.deliveryFeeCentimes : 0;
    const total = subtotal + deliveryFee + offer.serviceFeeCentimes;
    const deadlineMinutes = await this.settings.get('payment_deadline_minutes');
    const year = new Date().getUTCFullYear();

    let orderId: string;
    try {
      orderId = await this.uow.run(async (ctx) => {
        const accepted = await ctx.tx
          .update(offers)
          .set({ status: 'ACCEPTED' })
          .where(and(eq(offers.id, offerId), eq(offers.status, 'SENT')))
          .returning({ id: offers.id });
        if (!accepted.length)
          throw new AppException('ORDER_OFFER_NOT_AVAILABLE');
        const [{ seq }] = (
          await ctx.tx.execute<{ seq: string }>(
            sql`SELECT nextval('order_reference_seq')::text AS seq`,
          )
        ).rows;
        const [order] = await ctx.tx
          .insert(orders)
          .values({
            reference: `ORD-${year}-${seq.padStart(6, '0')}`,
            requestId: request.id,
            offerId,
            patientUserId: user.id,
            pharmacyId: offer.pharmacyId,
            status,
            workflowVariant: variant,
            fulfillmentType: dto.fulfillment_type,
            deliveryAddressSnapshot:
              dto.fulfillment_type === 'DELIVERY'
                ? request.deliveryAddressSnapshot
                : null,
            itemsSubtotalCentimes: subtotal,
            deliveryFeeCentimes: deliveryFee,
            serviceFeeCentimes: offer.serviceFeeCentimes,
            totalCentimes: total,
            paymentDeadlineAt:
              status === 'AWAITING_PAYMENT'
                ? new Date(Date.now() + deadlineMinutes * 60_000)
                : null,
            statusChangedAt: new Date(),
          })
          .returning();
        await ctx.tx.insert(orderItems).values(
          included.map((i) => ({
            orderId: order.id,
            offerItemId: i.id,
            name: i.name,
            quantity: i.quantityOffered,
            unitPriceCentimes: i.unitPriceCentimes,
            lineTotalCentimes: i.lineTotalCentimes,
          })),
        );
        await ctx.tx.insert(orderStatusHistory).values({
          orderId: order.id,
          fromStatus: null,
          toStatus: status,
          actorUserId: user.id,
          actorRole: user.role,
          metadata: {
            actor_kind: 'PATIENT',
            event: 'offer_accepted',
            workflow_variant: variant,
          },
        });
        await ctx.tx
          .update(offers)
          .set({ status: 'REJECTED' })
          .where(
            and(
              eq(offers.requestId, request.id),
              ne(offers.id, offerId),
              inArray(offers.status, ['SENT', 'DRAFT']),
            ),
          );
        await this.lifecycle.transition(ctx, request, 'OFFER_ACCEPTED', {
          userId: user.id,
          role: user.role,
        });
        await this.audit.log(
          {
            action: 'ORDER_CREATED',
            actorUserId: user.id,
            actorRole: user.role,
            resourceType: 'order',
            resourceId: order.id,
            ip: meta.ip,
            userAgent: meta.userAgent,
            metadata: {
              offer_id: offerId,
              total_centimes: total,
              workflow_variant: variant,
              fulfillment: dto.fulfillment_type,
            },
          },
          ctx.tx,
        );
        const event: OrderStatusChangedEvent = {
          orderId: order.id,
          reference: order.reference,
          patientUserId: user.id,
          pharmacyId: offer.pharmacyId,
          from: null,
          to: status,
          actorUserId: user.id,
        };
        ctx.emit(DomainEvent.ORDER_STATUS_CHANGED, event);
        return order.id;
      });
    } catch (err) {
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION)
        throw new AppException('ORDER_OFFER_NOT_AVAILABLE');
      throw err;
    }
    return this.patientView(await this.load(orderId));
  }

  // ---------------------------------------------------------------- views

  private async itemsOf(orderId: string) {
    const rows = await this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    return rows.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      unit_price_centimes: i.unitPriceCentimes,
      line_total_centimes: i.lineTotalCentimes,
    }));
  }

  private nextActions(o: OrderRow, side: 'PATIENT' | 'PHARMACY'): string[] {
    const v = o.workflowVariant as WorkflowVariant;
    const s = o.status as OrderStatus;
    const actions: string[] = [];
    if (side === 'PATIENT') {
      if (s === 'AWAITING_PAYMENT') actions.push('PAY');
      const target = cancelTarget(v, s);
      if (
        target &&
        (target === 'CANCELLED' ||
          s === 'PAYMENT_CONFIRMED' ||
          (v === 'PAYMENT_FIRST' && s === 'PHARMACIST_VALIDATION_PENDING'))
      )
        actions.push('CANCEL');
    } else {
      if (s === 'PHARMACIST_VALIDATION_PENDING') actions.push('VALIDATE');
      if (s === 'PAYMENT_CONFIRMED' && v === 'VALIDATION_FIRST')
        actions.push('START_PREPARING');
      if (s === 'PREPARING') actions.push('MARK_READY');
      if (s === 'READY_FOR_PICKUP' && o.fulfillmentType === 'PICKUP')
        actions.push('HANDOVER');
      if (cancelTarget(v, s)) actions.push('CANCEL');
    }
    return actions;
  }

  private async base(o: OrderRow) {
    return {
      id: o.id,
      reference: o.reference,
      request_id: o.requestId,
      offer_id: o.offerId,
      status: o.status,
      workflow_variant: o.workflowVariant,
      fulfillment_type: o.fulfillmentType,
      items: await this.itemsOf(o.id),
      items_subtotal_centimes: o.itemsSubtotalCentimes,
      delivery_fee_centimes: o.deliveryFeeCentimes,
      service_fee_centimes: o.serviceFeeCentimes,
      total_centimes: o.totalCentimes,
      currency: o.currency,
      pharmacist_validated: !!o.pharmacistValidatedAt,
      pharmacist_validated_at: o.pharmacistValidatedAt,
      payment_deadline_at: o.paymentDeadlineAt,
      cancel_reason: o.cancelReason,
      cancelled_at: o.cancelledAt,
      created_at: o.createdAt,
      updated_at: o.updatedAt,
    };
  }

  /** Patient sees their whole order. */
  async patientView(o: OrderRow) {
    const [p] = await this.db
      .select({
        nameFr: pharmacies.nameFr,
        nameAr: pharmacies.nameAr,
        address: pharmacies.addressLine,
        phone: pharmacies.phone,
        lat: pharmacies.latitude,
        lng: pharmacies.longitude,
      })
      .from(pharmacies)
      .where(eq(pharmacies.id, o.pharmacyId));
    return {
      ...(await this.base(o)),
      pharmacy: {
        id: o.pharmacyId,
        name_fr: p.nameFr,
        name_ar: p.nameAr,
        address_line: p.address,
        phone: p.phone,
        latitude: p.lat,
        longitude: p.lng,
      },
      delivery_address: o.deliveryAddressSnapshot ?? null,
      validation_note: o.validationNote,
      next_actions: this.nextActions(o, 'PATIENT'),
    };
  }

  /** Pharmacy sees what it needs: patient first name, delivery AREA only. */
  async pharmacyView(o: OrderRow) {
    const [pp] = await this.db
      .select({ firstName: patientProfiles.firstName })
      .from(patientProfiles)
      .where(eq(patientProfiles.userId, o.patientUserId));
    const snap = (o.deliveryAddressSnapshot ?? null) as Record<
      string,
      unknown
    > | null;
    return {
      ...(await this.base(o)),
      patient: { first_name: pp?.firstName ?? null },
      delivery_area: snap
        ? {
            wilaya_name_fr: snap.wilaya_name_fr,
            wilaya_name_ar: snap.wilaya_name_ar,
            commune_name_fr: snap.commune_name_fr,
            commune_name_ar: snap.commune_name_ar,
          }
        : null,
      validation_note: o.validationNote,
      pharmacist_validated_by: o.pharmacistValidatedBy,
      next_actions: this.nextActions(o, 'PHARMACY'),
    };
  }

  private async list(
    where: SQL,
    q: OrdersQueryDto,
    view: (o: OrderRow) => Promise<unknown>,
  ) {
    const conditions: SQL[] = [where];
    if (q.status?.length) conditions.push(inArray(orders.status, q.status));
    if (q.from) conditions.push(gte(orders.createdAt, new Date(q.from)));
    if (q.to) conditions.push(lt(orders.createdAt, new Date(q.to)));
    const w = and(...conditions);
    const sortCol =
      q.sort === 'updated_at' ? orders.updatedAt : orders.createdAt;
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(orders)
        .where(w)
        .orderBy(q.order === 'asc' ? asc(sortCol) : desc(sortCol))
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(orders).where(w),
    ]);
    return Paginated.of(
      await Promise.all(rows.map(view)),
      total,
      q.page,
      q.limit,
    );
  }

  listForPatient(user: AuthUser, q: OrdersQueryDto) {
    return this.list(eq(orders.patientUserId, user.id), q, (o) =>
      this.patientView(o),
    );
  }

  async getForPatient(user: AuthUser, id: string) {
    return this.patientView(await this.loadForPatient(user, id));
  }

  listForPharmacy(ph: PharmacyContext, q: OrdersQueryDto) {
    return this.list(eq(orders.pharmacyId, ph.id), q, (o) =>
      this.pharmacyView(o),
    );
  }

  async getForPharmacy(ph: PharmacyContext, id: string) {
    return this.pharmacyView(await this.loadForPharmacy(ph, id));
  }

  // --------------------------------------------------------------- cancel

  /** Patient cancel: free before capture; refund when allowed; approval needed later; never after pickup. */
  async cancelByPatient(user: AuthUser, id: string, reason: string) {
    const o = await this.loadForPatient(user, id);
    const target = cancelTarget(
      o.workflowVariant as WorkflowVariant,
      o.status as OrderStatus,
    );
    if (!target)
      throw new AppException('ORDER_NOT_CANCELLABLE', { status: o.status });
    const actor: Actor = { kind: 'PATIENT', userId: user.id, role: user.role };
    if (
      checkTransition(
        o.workflowVariant as WorkflowVariant,
        o.status as OrderStatus,
        target,
        'PATIENT',
      ) !== 'OK'
    ) {
      throw new AppException('ORDER_CANCEL_REQUIRES_APPROVAL', {
        status: o.status,
      });
    }
    const updated = await this.sm.transition(o.id, target, actor, {
      reason,
      set: {
        cancelReason: reason,
        cancelledByUserId: user.id,
        cancelledAt: new Date(),
      },
    });
    return this.patientView(updated);
  }

  async cancelByPharmacy(
    user: AuthUser,
    ph: PharmacyContext,
    id: string,
    reason: string,
  ) {
    const o = await this.loadForPharmacy(ph, id);
    const target = cancelTarget(
      o.workflowVariant as WorkflowVariant,
      o.status as OrderStatus,
    );
    if (!target)
      throw new AppException('ORDER_NOT_CANCELLABLE', { status: o.status });
    const actor = await this.sm.actorFor(user, o);
    const updated = await this.sm.transition(o.id, target, actor, {
      reason,
      set: {
        cancelReason: reason,
        cancelledByUserId: user.id,
        cancelledAt: new Date(),
      },
    });
    return this.pharmacyView(updated);
  }

  // ---------------------------------------------------------- fulfillment

  /** Explicit pharmacist decision (OWNER/PHARMACIST): APPROVE moves on, REJECT cancels / refunds. */
  async validate(
    user: AuthUser,
    ph: PharmacyContext,
    id: string,
    dto: ValidateOrderDto,
  ) {
    if (dto.confirm !== true)
      throw new AppException('ORDER_VALIDATION_CONFIRM_REQUIRED');
    const o = await this.loadForPharmacy(ph, id);
    if (o.status !== 'PHARMACIST_VALIDATION_PENDING')
      throw new AppException('ORDER_INVALID_TRANSITION', {
        from: o.status,
        to: 'VALIDATED',
      });
    const actor = await this.sm.actorFor(user, o);
    const variant = o.workflowVariant as WorkflowVariant;
    let updated: OrderRow;
    if (dto.decision === 'APPROVE') {
      const minutes = await this.settings.get('payment_deadline_minutes');
      updated = await this.sm.transition(
        o.id,
        variant === 'VALIDATION_FIRST' ? 'AWAITING_PAYMENT' : 'PREPARING',
        actor,
        {
          reason: dto.note,
          metadata: { decision: 'APPROVE' },
          set: {
            pharmacistValidatedBy: user.id,
            pharmacistValidatedAt: new Date(),
            validationNote: dto.note,
            ...(variant === 'VALIDATION_FIRST'
              ? { paymentDeadlineAt: new Date(Date.now() + minutes * 60_000) }
              : {}),
          },
        },
      );
    } else {
      updated = await this.sm.transition(
        o.id,
        variant === 'VALIDATION_FIRST' ? 'CANCELLED' : 'REFUND_PENDING',
        actor,
        {
          reason: dto.note,
          metadata: { decision: 'REJECT' },
          set: {
            validationNote: dto.note,
            cancelReason: dto.note,
            cancelledByUserId: user.id,
            cancelledAt: new Date(),
          },
        },
      );
    }
    return this.pharmacyView(updated);
  }

  async startPreparing(user: AuthUser, ph: PharmacyContext, id: string) {
    const o = await this.loadForPharmacy(ph, id);
    return this.pharmacyView(
      await this.sm.transition(
        o.id,
        'PREPARING',
        await this.sm.actorFor(user, o),
      ),
    );
  }

  async markReady(user: AuthUser, ph: PharmacyContext, id: string) {
    const o = await this.loadForPharmacy(ph, id);
    return this.pharmacyView(
      await this.sm.transition(
        o.id,
        'READY_FOR_PICKUP',
        await this.sm.actorFor(user, o),
      ),
    );
  }

  /** Pickup hand-over: the patient shows their collection code. */
  async handover(
    user: AuthUser,
    ph: PharmacyContext,
    id: string,
    code: string,
  ) {
    const o = await this.loadForPharmacy(ph, id);
    if (o.fulfillmentType !== 'PICKUP' || o.status !== 'READY_FOR_PICKUP')
      throw new AppException('ORDER_INVALID_TRANSITION', {
        from: o.status,
        to: 'COMPLETED',
      });
    if (o.collectionCodeAttempts >= MAX_CODE_ATTEMPTS)
      throw new AppException('ORDER_COLLECTION_CODE_LOCKED');
    if (
      !o.collectionCodeHash ||
      !this.crypto.hmacEquals(`collect|${o.id}|${code}`, o.collectionCodeHash)
    ) {
      await this.db
        .update(orders)
        .set({
          collectionCodeAttempts: sql`${orders.collectionCodeAttempts} + 1`,
        })
        .where(eq(orders.id, o.id));
      throw new AppException(
        o.collectionCodeAttempts + 1 >= MAX_CODE_ATTEMPTS
          ? 'ORDER_COLLECTION_CODE_LOCKED'
          : 'ORDER_COLLECTION_CODE_INVALID',
      );
    }
    const updated = await this.sm.transition(
      o.id,
      'COMPLETED',
      await this.sm.actorFor(user, o),
      { set: { collectionCodeHash: null } },
    );
    return this.pharmacyView(updated);
  }

  /** Patient gets a fresh collection code (shown once, never stored in clear). */
  async regenerateCollectionCode(user: AuthUser, id: string) {
    const o = await this.loadForPatient(user, id);
    if (o.fulfillmentType !== 'PICKUP' || o.status !== 'READY_FOR_PICKUP')
      throw new AppException('ORDER_INVALID_TRANSITION', {
        from: o.status,
        to: 'COLLECTION_CODE',
      });
    const code = this.crypto.numericCode(6);
    await this.db
      .update(orders)
      .set({
        collectionCodeHash: this.crypto.hmac(`collect|${o.id}|${code}`),
        collectionCodeAttempts: 0,
      })
      .where(eq(orders.id, o.id));
    return { order_id: o.id, collection_code: code };
  }

  // -------------------------------------------------------------- timeline

  async timeline(user: AuthUser, id: string, ph?: PharmacyContext) {
    const o = ph
      ? await this.loadForPharmacy(ph, id)
      : await this.loadForPatient(user, id);
    const lang = user.preferredLanguage as Lang;
    const rows = await this.db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, o.id))
      .orderBy(asc(orderStatusHistory.createdAt));
    const actorLabel = (kind?: string) =>
      kind === 'PATIENT'
        ? 'PATIENT'
        : kind === 'DRIVER'
          ? 'DRIVER'
          : kind === 'PHARMACY' || kind === 'PHARMACIST'
            ? 'PHARMACY'
            : 'PLATFORM';
    return {
      order_id: o.id,
      reference: o.reference,
      current_status: o.status,
      events: rows.map((h) => ({
        status: h.toStatus,
        label: this.i18n.t(`labels.order_status.${h.toStatus}`, lang),
        description: this.i18n.t(
          `labels.order_status_description.${h.toStatus}`,
          lang,
        ),
        from_status: h.fromStatus,
        actor: actorLabel(
          (h.metadata as { actor_kind?: string } | null)?.actor_kind,
        ),
        reason: h.reason,
        at: h.createdAt,
      })),
    };
  }

  // --------------------------------------------------------------- timeouts

  /** AWAITING_PAYMENT past its deadline → CANCELLED. */
  async cancelUnpaid(now = new Date()) {
    const due = await this.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.status, 'AWAITING_PAYMENT'),
          isNotNull(orders.paymentDeadlineAt),
          lt(orders.paymentDeadlineAt, now),
        ),
      )
      .limit(200);
    let n = 0;
    for (const o of due) {
      try {
        await this.sm.transition(o.id, 'CANCELLED', SYSTEM_ACTOR, {
          reason: 'payment_deadline_expired',
          set: { cancelReason: 'payment_deadline_expired', cancelledAt: now },
        });
        n++;
      } catch {
        /* lost a race with a user action – fine */
      }
    }
    return n;
  }

  /** Validation not done in time → CANCELLED (VF) / REFUND_PENDING (PF) + admin alert. */
  async expireValidation(now = new Date()) {
    const minutes = await this.settings.get(
      'pharmacist_validation_timeout_minutes',
    );
    const due = await this.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.status, 'PHARMACIST_VALIDATION_PENDING'),
          lt(
            orders.statusChangedAt,
            new Date(now.getTime() - minutes * 60_000),
          ),
        ),
      )
      .limit(200);
    let n = 0;
    for (const o of due) {
      const to: OrderStatus =
        o.workflowVariant === 'VALIDATION_FIRST'
          ? 'CANCELLED'
          : 'REFUND_PENDING';
      try {
        await this.sm.transition(o.id, to, SYSTEM_ACTOR, {
          reason: 'pharmacist_validation_timeout',
          set: {
            cancelReason: 'pharmacist_validation_timeout',
            cancelledAt: now,
          },
        });
        await this.notifyAdmins(
          'VALIDATION_TIMEOUT',
          o,
          `Order ${o.reference}: pharmacist validation timeout`,
        );
        n++;
      } catch {
        /* concurrent change */
      }
    }
    return n;
  }

  /** Delivery not assigned in time → admin alert (once per order). */
  async alertUnassignedDeliveries(now = new Date()) {
    const minutes = await this.settings.get(
      'delivery_assignment_timeout_minutes',
    );
    const due = await this.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.status, 'READY_FOR_PICKUP'),
          eq(orders.fulfillmentType, 'DELIVERY'),
          lt(
            orders.statusChangedAt,
            new Date(now.getTime() - minutes * 60_000),
          ),
          sql`${orders.assignmentAlertedAt} IS NULL`,
        ),
      )
      .limit(200);
    for (const o of due) {
      await this.db
        .update(orders)
        .set({ assignmentAlertedAt: now })
        .where(eq(orders.id, o.id));
      await this.notifyAdmins(
        'DELIVERY_UNASSIGNED',
        o,
        `Order ${o.reference}: no driver assigned`,
      );
    }
    return due.length;
  }

  private async notifyAdmins(kind: string, o: OrderRow, message: string) {
    const admins = await this.db.execute<{ id: string }>(
      sql`SELECT id FROM users WHERE role IN ('ADMIN','SUPER_ADMIN') AND status = 'ACTIVE' AND deleted_at IS NULL`,
    );
    await this.notifications.notify({
      userIds: admins.rows.map((r) => r.id),
      type: 'ADMIN_ALERT',
      params: { message },
      data: { order_id: o.id, kind },
    });
  }
}
