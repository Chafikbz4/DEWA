import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, lt, ne, SQL } from 'drizzle-orm';
import { AuthUser, PharmacyContext } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { DomainEvent, OfferEvent } from '../../common/events/domain-events';
import { TxContext, UnitOfWork } from '../../common/events/unit-of-work';
import { Paginated } from '../../common/http/envelope';
import { Database, DbOrTx, DRIZZLE } from '../../database/database.module';
import {
  offerItems,
  offers,
  pharmacies,
  requestItems,
  requestRecipients,
  requests,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { DeliveryFeeService } from '../delivery-config/delivery-fee.service';
import { ACTIVE_RECIPIENT, InboxService } from '../pharmacies/inbox.service';
import { EligibilityService } from '../requests/eligibility.service';
import { RequestLifecycleService } from '../requests/request-lifecycle.service';
import { SettingsService } from '../settings/settings.service';
import {
  CreateOfferDto,
  OfferDto,
  PharmacyOffersQueryDto,
} from './dto/offers.dto';

type OfferRow = typeof offers.$inferSelect;
type OfferItemRow = typeof offerItems.$inferSelect;
type RequestRow = typeof requests.$inferSelect;

const OPEN_FOR_OFFERS = [
  'AWAITING_PHARMACY_RESPONSE',
  'CLARIFICATION_REQUIRED',
  'OFFER_AVAILABLE',
] as const;

@Injectable()
export class OffersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly uow: UnitOfWork,
    private readonly eligibility: EligibilityService,
    private readonly fees: DeliveryFeeService,
    private readonly settings: SettingsService,
    private readonly lifecycle: RequestLifecycleService,
    private readonly inbox: InboxService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------- presenter

  present(
    o: OfferRow,
    items: OfferItemRow[],
    pharmacy: { nameFr: string; nameAr: string },
  ): OfferDto {
    const rejected = items
      .filter((i) => i.isAlternative && i.patientApproval === 'REJECTED')
      .reduce((s, i) => s + i.lineTotalCentimes, 0);
    return {
      id: o.id,
      request_id: o.requestId,
      pharmacy: {
        id: o.pharmacyId,
        name_fr: pharmacy.nameFr,
        name_ar: pharmacy.nameAr,
      },
      status: o.status,
      items: items.map((i) => ({
        id: i.id,
        request_item_id: i.requestItemId,
        medicine_id: i.medicineId,
        name: i.name,
        quantity_requested: i.quantityRequested,
        quantity_offered: i.quantityOffered,
        unit_price_centimes: i.unitPriceCentimes,
        line_total_centimes: i.lineTotalCentimes,
        availability: i.availability,
        is_alternative: i.isAlternative,
        alternative_reason: i.alternativeReason,
        patient_approval: i.patientApproval,
      })),
      items_subtotal_centimes: o.itemsSubtotalCentimes,
      delivery_fee_centimes: o.deliveryFeeCentimes,
      service_fee_centimes: o.serviceFeeCentimes,
      total_centimes: o.totalCentimes,
      effective_total_centimes: o.totalCentimes - rejected,
      alternatives_pending: items.filter((i) => i.patientApproval === 'PENDING')
        .length,
      preparation_minutes: o.preparationMinutes,
      valid_until: o.validUntil,
      delivery_available: o.deliveryAvailable,
      pharmacy_note: o.pharmacyNote,
      requires_prescription_original: o.requiresPrescriptionOriginal,
      sent_at: o.sentAt,
      created_at: o.createdAt,
    };
  }

  async load(id: string, tx: DbOrTx = this.db) {
    const [row] = await tx
      .select({
        o: offers,
        nameFr: pharmacies.nameFr,
        nameAr: pharmacies.nameAr,
      })
      .from(offers)
      .innerJoin(pharmacies, eq(pharmacies.id, offers.pharmacyId))
      .where(eq(offers.id, id))
      .limit(1);
    if (!row) throw new AppException('OFFER_NOT_FOUND');
    const items = await tx
      .select()
      .from(offerItems)
      .where(eq(offerItems.offerId, id))
      .orderBy(asc(offerItems.position));
    return {
      offer: row.o,
      items,
      pharmacy: { nameFr: row.nameFr, nameAr: row.nameAr },
    };
  }

  async view(id: string, tx: DbOrTx = this.db) {
    const { offer, items, pharmacy } = await this.load(id, tx);
    return this.present(offer, items, pharmacy);
  }

  // ------------------------------------------------------- price computing

  /**
   * Validates lines and computes every amount server-side: line totals,
   * subtotal, delivery fee (from delivery_fee_rules), service fee (setting).
   */
  private async build(
    ph: PharmacyContext,
    request: RequestRow,
    dto: CreateOfferDto,
  ) {
    const reqItems = await this.db
      .select()
      .from(requestItems)
      .where(eq(requestItems.requestId, request.id));
    const reqItemById = new Map(reqItems.map((i) => [i.id, i]));

    const clinical = ph.staffRole === 'OWNER' || ph.staffRole === 'PHARMACIST';
    if (dto.items.some((i) => i.is_alternative) && !clinical)
      throw new AppException('OFFER_ALTERNATIVE_REQUIRES_PHARMACIST');

    for (const i of dto.items) {
      if (i.request_item_id && !reqItemById.has(i.request_item_id)) {
        throw new AppException('OFFER_ITEM_INVALID', {
          request_item_id: i.request_item_id,
        });
      }
      if (i.is_alternative && !i.alternative_reason) {
        throw new AppException('VALIDATION_FAILED', [
          {
            field: 'items.alternative_reason',
            errors: [
              { rule: 'isNotEmpty', message_key: 'validation.isNotEmpty' },
            ],
          },
        ]);
      }
    }

    // Items restricted by policy can never be offered online.
    const medicineIds = dto.items
      .map((i) => i.medicine_id)
      .filter((x): x is string => !!x);
    if (medicineIds.length) {
      const categories = await this.eligibility.categoriesOf(medicineIds);
      const policies = await this.eligibility.enabledPolicies([
        ...new Set(categories.values()),
      ]);
      const blocked = dto.items
        .filter((i) => i.medicine_id && i.availability !== 'UNAVAILABLE')
        .filter(
          (i) =>
            !policies.get(categories.get(i.medicine_id!)!)
              ?.allowedOnlineRequest,
        )
        .map((i) => ({
          medicine_id: i.medicine_id,
          category: categories.get(i.medicine_id!),
        }));
      if (blocked.length)
        throw new AppException('OFFER_ITEM_RESTRICTED', { items: blocked });
    }

    const lines = dto.items.map((i, position) => {
      const unavailable = i.availability === 'UNAVAILABLE';
      const qty = unavailable ? 0 : i.quantity_offered;
      const requested =
        i.quantity_requested ??
        (i.request_item_id
          ? reqItemById.get(i.request_item_id)!.quantity
          : i.quantity_offered);
      return {
        position,
        requestItemId: i.request_item_id ?? null,
        medicineId: i.medicine_id ?? null,
        name: i.name,
        quantityRequested: requested,
        quantityOffered: qty,
        unitPriceCentimes: i.unit_price_centimes,
        lineTotalCentimes: qty * i.unit_price_centimes,
        availability: i.availability,
        isAlternative: !!i.is_alternative,
        alternativeReason: i.is_alternative
          ? (i.alternative_reason ?? null)
          : null,
        patientApproval: i.is_alternative
          ? ('PENDING' as const)
          : ('NOT_REQUIRED' as const),
      };
    });
    const subtotal = lines.reduce((s, l) => s + l.lineTotalCentimes, 0);

    let deliveryFee = 0;
    if (dto.delivery_available) {
      const [p] = await this.db
        .select()
        .from(pharmacies)
        .where(eq(pharmacies.id, ph.id))
        .limit(1);
      if (
        !request.deliveryWanted ||
        !p.deliveryAvailable ||
        !(await this.settings.get('delivery_enabled'))
      ) {
        throw new AppException('OFFER_DELIVERY_NOT_AVAILABLE');
      }
      const snap = (request.deliveryAddressSnapshot ?? {}) as Record<
        string,
        number | null
      >;
      const fee = await this.fees.compute({
        wilayaId: Number(snap.wilaya_id),
        communeId: Number(snap.commune_id),
        from: { latitude: p.latitude, longitude: p.longitude },
        to: {
          latitude: snap.latitude ?? null,
          longitude: snap.longitude ?? null,
        },
      });
      deliveryFee = fee.feeCentimes;
    }
    const serviceFee = Number(await this.settings.get('service_fee_centimes'));

    let validUntil: Date;
    if (dto.valid_until) {
      validUntil = new Date(dto.valid_until);
      if (validUntil <= new Date()) {
        throw new AppException('VALIDATION_FAILED', [
          {
            field: 'valid_until',
            errors: [{ rule: 'min', message_key: 'validation.min' }],
          },
        ]);
      }
    } else {
      validUntil = new Date(
        Date.now() +
          (await this.settings.get('offer_validity_hours')) * 3_600_000,
      );
    }

    return {
      lines,
      header: {
        itemsSubtotalCentimes: subtotal,
        deliveryFeeCentimes: deliveryFee,
        serviceFeeCentimes: serviceFee,
        totalCentimes: subtotal + deliveryFee + serviceFee,
        preparationMinutes: dto.preparation_minutes ?? null,
        validUntil,
        deliveryAvailable: dto.delivery_available,
        pharmacyNote: dto.note ?? null,
        requiresPrescriptionOriginal:
          dto.requires_prescription_original ?? false,
      },
    };
  }

  private async requestForPharmacy(ph: PharmacyContext, requestId: string) {
    const [row] = await this.db
      .select({ r: requests, rr: requestRecipients })
      .from(requestRecipients)
      .innerJoin(requests, eq(requests.id, requestRecipients.requestId))
      .where(
        and(
          eq(requestRecipients.requestId, requestId),
          eq(requestRecipients.pharmacyId, ph.id),
        ),
      )
      .limit(1);
    if (!row) throw new AppException('REQUEST_NOT_FOUND');
    if (
      !ACTIVE_RECIPIENT.includes(row.rr.status) ||
      !(OPEN_FOR_OFFERS as readonly string[]).includes(row.r.status)
    ) {
      throw new AppException('RECIPIENT_CLOSED', {
        recipient_status: row.rr.status,
        request_status: row.r.status,
      });
    }
    return row;
  }

  // -------------------------------------------------------- pharmacy side

  async create(
    user: AuthUser,
    ph: PharmacyContext,
    requestId: string,
    dto: CreateOfferDto,
    meta: RequestMeta,
  ) {
    const { r } = await this.requestForPharmacy(ph, requestId);
    const [active] = await this.db
      .select({ id: offers.id })
      .from(offers)
      .where(
        and(
          eq(offers.requestId, r.id),
          eq(offers.pharmacyId, ph.id),
          inArray(offers.status, ['DRAFT', 'SENT']),
        ),
      )
      .limit(1);
    if (active)
      throw new AppException('OFFER_ALREADY_EXISTS', { offer_id: active.id });

    const { lines, header } = await this.build(ph, r, dto);
    const id = await this.db.transaction(async (tx) => {
      const [o] = await tx
        .insert(offers)
        .values({
          requestId: r.id,
          pharmacyId: ph.id,
          status: 'DRAFT',
          createdByUserId: user.id,
          ...header,
        })
        .returning({ id: offers.id });
      await tx
        .insert(offerItems)
        .values(lines.map((l) => ({ ...l, offerId: o.id })));
      await this.audit.log(
        {
          action: 'OFFER_CREATED',
          actorUserId: user.id,
          actorRole: user.role,
          resourceType: 'offer',
          resourceId: o.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
          metadata: { request_id: r.id, total_centimes: header.totalCentimes },
        },
        tx,
      );
      return o.id;
    });
    return this.view(id);
  }

  private async ownOffer(ph: PharmacyContext, offerId: string) {
    const loaded = await this.load(offerId);
    if (loaded.offer.pharmacyId !== ph.id)
      throw new AppException('OFFER_NOT_FOUND');
    return loaded;
  }

  async update(
    user: AuthUser,
    ph: PharmacyContext,
    offerId: string,
    dto: CreateOfferDto,
    meta: RequestMeta,
  ) {
    const { offer } = await this.ownOffer(ph, offerId);
    if (offer.status !== 'DRAFT') throw new AppException('OFFER_NOT_EDITABLE');
    const { r } = await this.requestForPharmacy(ph, offer.requestId);
    const { lines, header } = await this.build(ph, r, dto);
    await this.db.transaction(async (tx) => {
      await tx.update(offers).set(header).where(eq(offers.id, offerId));
      await tx.delete(offerItems).where(eq(offerItems.offerId, offerId));
      await tx.insert(offerItems).values(lines.map((l) => ({ ...l, offerId })));
      await this.audit.log(
        {
          action: 'OFFER_UPDATED',
          actorUserId: user.id,
          actorRole: user.role,
          resourceType: 'offer',
          resourceId: offerId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
        tx,
      );
    });
    return this.view(offerId);
  }

  async send(
    user: AuthUser,
    ph: PharmacyContext,
    offerId: string,
    meta: RequestMeta,
  ) {
    const { offer, items } = await this.ownOffer(ph, offerId);
    if (offer.status !== 'DRAFT') throw new AppException('OFFER_NOT_EDITABLE');
    if (offer.validUntil && offer.validUntil <= new Date())
      throw new AppException('OFFER_EXPIRED');
    if (
      !items.some(
        (i) => i.availability !== 'UNAVAILABLE' && i.quantityOffered > 0,
      )
    )
      throw new AppException('OFFER_NOT_SENDABLE');
    const { r, rr } = await this.requestForPharmacy(ph, offer.requestId);
    const clinical = ph.staffRole === 'OWNER' || ph.staffRole === 'PHARMACIST';

    await this.uow.run(async (ctx) => {
      const sent = await ctx.tx
        .update(offers)
        .set({ status: 'SENT', sentAt: new Date() })
        .where(and(eq(offers.id, offerId), eq(offers.status, 'DRAFT')))
        .returning({ id: offers.id });
      if (!sent.length) throw new AppException('OFFER_NOT_EDITABLE');
      await ctx.tx
        .update(requestRecipients)
        .set({
          status: 'OFFERED',
          respondedAt: rr.respondedAt ?? new Date(),
          viewedAt: rr.viewedAt ?? new Date(),
        })
        .where(eq(requestRecipients.id, rr.id));
      if (clinical) {
        const linked = items
          .map((i) => i.requestItemId)
          .filter((x): x is string => !!x);
        if (linked.length)
          await ctx.tx
            .update(requestItems)
            .set({ confirmedByPharmacist: true })
            .where(inArray(requestItems.id, linked));
      }
      if (r.status !== 'OFFER_AVAILABLE') {
        await this.lifecycle.transition(ctx, r, 'OFFER_AVAILABLE', {
          userId: user.id,
          role: user.role,
        });
      }
      await this.inbox.refreshResponseTime(ctx.tx, ph.id);
      await this.audit.log(
        {
          action: 'OFFER_SENT',
          actorUserId: user.id,
          actorRole: user.role,
          resourceType: 'offer',
          resourceId: offerId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
        ctx.tx,
      );
      const event: OfferEvent = {
        offerId,
        requestId: r.id,
        reference: r.reference,
        patientUserId: r.patientUserId,
        pharmacyId: ph.id,
      };
      ctx.emit(DomainEvent.OFFER_SENT, event);
    });
    return this.view(offerId);
  }

  async withdraw(
    user: AuthUser,
    ph: PharmacyContext,
    offerId: string,
    meta: RequestMeta,
  ) {
    const { offer } = await this.ownOffer(ph, offerId);
    if (offer.status !== 'DRAFT' && offer.status !== 'SENT')
      throw new AppException('OFFER_NOT_WITHDRAWABLE');
    await this.uow.run(async (ctx) => {
      const done = await ctx.tx
        .update(offers)
        .set({ status: 'WITHDRAWN', withdrawnAt: new Date() })
        .where(
          and(
            eq(offers.id, offerId),
            inArray(offers.status, ['DRAFT', 'SENT']),
          ),
        )
        .returning({ id: offers.id });
      if (!done.length) throw new AppException('OFFER_NOT_WITHDRAWABLE');
      if (offer.status === 'SENT') {
        await ctx.tx
          .update(requestRecipients)
          .set({ status: 'VIEWED' })
          .where(
            and(
              eq(requestRecipients.requestId, offer.requestId),
              eq(requestRecipients.pharmacyId, ph.id),
              eq(requestRecipients.status, 'OFFERED'),
            ),
          );
        await this.reopenIfNoOffers(ctx, offer.requestId, {
          userId: user.id,
          role: user.role,
        });
        ctx.emit(DomainEvent.OFFER_WITHDRAWN, {
          offerId,
          requestId: offer.requestId,
          pharmacyId: ph.id,
        });
      }
      await this.audit.log(
        {
          action: 'OFFER_WITHDRAWN',
          actorUserId: user.id,
          actorRole: user.role,
          resourceType: 'offer',
          resourceId: offerId,
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
        ctx.tx,
      );
    });
    return this.view(offerId);
  }

  /** OFFER_AVAILABLE with no SENT offer left → back to AWAITING_PHARMACY_RESPONSE. */
  private async reopenIfNoOffers(
    ctx: TxContext,
    requestId: string,
    actor: { userId: string | null; role: string | null },
  ) {
    const [r] = await ctx.tx
      .select()
      .from(requests)
      .where(eq(requests.id, requestId))
      .limit(1);
    if (r?.status !== 'OFFER_AVAILABLE') return;
    const [{ n }] = await ctx.tx
      .select({ n: count() })
      .from(offers)
      .where(and(eq(offers.requestId, requestId), eq(offers.status, 'SENT')));
    if (n === 0)
      await this.lifecycle.transition(
        ctx,
        r,
        'AWAITING_PHARMACY_RESPONSE',
        actor,
      );
  }

  async listForPharmacy(ph: PharmacyContext, q: PharmacyOffersQueryDto) {
    const conditions: SQL[] = [eq(offers.pharmacyId, ph.id)];
    if (q.status?.length) conditions.push(inArray(offers.status, q.status));
    const where = and(...conditions);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ o: offers, reference: requests.reference })
        .from(offers)
        .innerJoin(requests, eq(requests.id, offers.requestId))
        .where(where)
        .orderBy(
          q.order === 'asc' ? asc(offers.createdAt) : desc(offers.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(offers).where(where),
    ]);
    return Paginated.of(
      rows.map(({ o, reference }) => ({
        id: o.id,
        request_id: o.requestId,
        request_reference: reference,
        status: o.status,
        total_centimes: o.totalCentimes,
        valid_until: o.validUntil,
        sent_at: o.sentAt,
        created_at: o.createdAt,
      })),
      total,
      q.page,
      q.limit,
    );
  }

  async getForPharmacy(ph: PharmacyContext, offerId: string) {
    const { offer, items, pharmacy } = await this.ownOffer(ph, offerId);
    return this.present(offer, items, pharmacy);
  }

  // --------------------------------------------------------- patient side

  private async patientRequest(user: AuthUser, requestId: string) {
    const [r] = await this.db
      .select()
      .from(requests)
      .where(
        and(eq(requests.id, requestId), eq(requests.patientUserId, user.id)),
      )
      .limit(1);
    if (!r) throw new AppException('REQUEST_NOT_FOUND');
    return r;
  }

  /** Patients never see drafts. */
  async listForRequest(user: AuthUser, requestId: string) {
    await this.patientRequest(user, requestId);
    const rows = await this.db
      .select({ id: offers.id })
      .from(offers)
      .where(and(eq(offers.requestId, requestId), ne(offers.status, 'DRAFT')))
      .orderBy(asc(offers.totalCentimes));
    return Promise.all(rows.map((r) => this.view(r.id)));
  }

  async getForPatient(user: AuthUser, offerId: string) {
    const { offer, items, pharmacy } = await this.load(offerId);
    if (offer.status === 'DRAFT') throw new AppException('OFFER_NOT_FOUND');
    await this.patientRequest(user, offer.requestId).catch(() => {
      throw new AppException('OFFER_NOT_FOUND');
    });
    return this.present(offer, items, pharmacy);
  }

  /** Side-by-side comparison of SENT offers, normalized on the request items. */
  async compare(user: AuthUser, requestId: string) {
    const r = await this.patientRequest(user, requestId);
    const reqItems = await this.db
      .select()
      .from(requestItems)
      .where(eq(requestItems.requestId, requestId));
    const sentRows = await this.db
      .select({ id: offers.id })
      .from(offers)
      .where(and(eq(offers.requestId, requestId), eq(offers.status, 'SENT')));
    const snap = (r.deliveryAddressSnapshot ?? {}) as Record<
      string,
      number | null
    >;

    const rows = [];
    for (const { id } of sentRows) {
      const { offer, items, pharmacy } = await this.load(id);
      const [p] = await this.db
        .select({ lat: pharmacies.latitude, lng: pharmacies.longitude })
        .from(pharmacies)
        .where(eq(pharmacies.id, offer.pharmacyId));
      const covered = new Map(
        items.filter((i) => i.requestItemId).map((i) => [i.requestItemId!, i]),
      );
      const missing = reqItems
        .filter(
          (ri) =>
            !covered.has(ri.id) ||
            covered.get(ri.id)!.availability === 'UNAVAILABLE',
        )
        .map((ri) => ri.rawName);
      const partial = reqItems
        .filter((ri) => covered.get(ri.id)?.availability === 'PARTIAL')
        .map((ri) => ri.rawName);
      const view = this.present(offer, items, pharmacy);
      rows.push({
        offer_id: offer.id,
        pharmacy: view.pharmacy,
        total_centimes: view.total_centimes,
        effective_total_centimes: view.effective_total_centimes,
        items_subtotal_centimes: view.items_subtotal_centimes,
        delivery_fee_centimes: view.delivery_fee_centimes,
        service_fee_centimes: view.service_fee_centimes,
        preparation_minutes: view.preparation_minutes,
        delivery_available: view.delivery_available,
        valid_until: view.valid_until,
        items_offered: items.filter((i) => i.availability !== 'UNAVAILABLE')
          .length,
        missing_items: missing,
        partial_items: partial,
        alternatives: items.filter((i) => i.isAlternative).length,
        alternatives_pending: view.alternatives_pending,
        covers_all_items:
          reqItems.length > 0 && missing.length === 0 && partial.length === 0,
        distance_km: await this.fees.distanceKm(
          { latitude: p.lat, longitude: p.lng },
          {
            latitude: snap.latitude ?? null,
            longitude: snap.longitude ?? null,
          },
        ),
      });
    }
    rows.sort(
      (a, b) => a.effective_total_centimes - b.effective_total_centimes,
    );
    return {
      request_id: requestId,
      request_items_count: reqItems.length,
      offers: rows,
    };
  }

  /** Patient explicitly approves / rejects each proposed substitution. */
  async decideAlternative(
    user: AuthUser,
    offerId: string,
    itemId: string,
    decision: 'APPROVED' | 'REJECTED',
    meta: RequestMeta,
  ) {
    const { offer } = await this.load(offerId);
    await this.patientRequest(user, offer.requestId).catch(() => {
      throw new AppException('OFFER_NOT_FOUND');
    });
    if (offer.status !== 'SENT') throw new AppException('OFFER_NOT_FOUND');
    const res = await this.db
      .update(offerItems)
      .set({ patientApproval: decision })
      .where(
        and(
          eq(offerItems.id, itemId),
          eq(offerItems.offerId, offerId),
          eq(offerItems.patientApproval, 'PENDING'),
        ),
      )
      .returning({ id: offerItems.id });
    if (!res.length) throw new AppException('OFFER_ITEM_APPROVAL_NOT_PENDING');
    await this.audit.log({
      action: 'OFFER_ALTERNATIVE_DECIDED',
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'offer',
      resourceId: offerId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { item_id: itemId, decision },
    });
    return this.view(offerId);
  }

  // ----------------------------------------------------------------- expiry

  /** SENT offers past valid_until → EXPIRED; requests left without offers reopen. */
  async expireDue(now = new Date()) {
    const due = await this.db
      .select({ id: offers.id, requestId: offers.requestId })
      .from(offers)
      .where(and(eq(offers.status, 'SENT'), lt(offers.validUntil, now)))
      .limit(500);
    for (const o of due) {
      await this.uow.run(async (ctx) => {
        const done = await ctx.tx
          .update(offers)
          .set({ status: 'EXPIRED' })
          .where(and(eq(offers.id, o.id), eq(offers.status, 'SENT')))
          .returning({ id: offers.id });
        if (done.length)
          await this.reopenIfNoOffers(ctx, o.requestId, {
            userId: null,
            role: null,
          });
      });
    }
    return due.length;
  }
}
