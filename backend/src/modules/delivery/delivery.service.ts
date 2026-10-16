import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { randomInt, randomUUID } from 'node:crypto';
import type { AuthUser, PharmacyContext } from '../../common/auth/auth-user';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import {
  DeliveryStatusChangedEvent,
  DomainEvent,
} from '../../common/events/domain-events';
import { TxContext, UnitOfWork } from '../../common/events/unit-of-work';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  deliveries,
  deliveryStatusHistory,
  drivers,
  orders,
  patientProfiles,
  pharmacies,
  users,
} from '../../database/schema';
import type { Role } from '../../database/schema/enums';
import {
  OrderRow,
  OrderStateMachineService,
} from '../orders/order-state-machine.service';
import { SettingsService } from '../settings/settings.service';
import { canMove, DeliveryStatus } from './delivery-state';

export type DeliveryRow = typeof deliveries.$inferSelect;

export interface DeliveryActor {
  userId: string | null;
  role: Role | null;
}

export interface PickupSnapshot {
  pharmacy_name: string;
  address: string;
  wilaya_id: number;
  commune_id: number;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Only what a driver needs to hand over the parcel – no medical data. */
export interface DropoffSnapshot {
  first_name: string;
  phone: string | null;
  address: string;
  wilaya_id: number;
  wilaya_name_fr: string | null;
  wilaya_name_ar: string | null;
  commune_id: number;
  commune_name_fr: string | null;
  commune_name_ar: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
}

const PACKAGE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Code hashes are bound to the delivery and their purpose. */
export const pickupCodeInput = (deliveryId: string, code: string) =>
  `pickup|${deliveryId}|${code}`;
export const deliveryCodeInput = (deliveryId: string, code: string) =>
  `deliver|${deliveryId}|${code}`;

/**
 * Delivery core: creates jobs when a delivery order becomes ready, keeps the
 * delivery status in step with the order state machine (append-only history,
 * optimistic lock), issues hashed pickup / delivery codes and serves the
 * patient and pharmacy views.
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger('Delivery');

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly uow: UnitOfWork,
    private readonly sm: OrderStateMachineService,
    private readonly crypto: CryptoService,
    private readonly settings: SettingsService,
  ) {
    // Delivery orders get a job as soon as the pharmacy marks them ready.
    this.sm.onEnter('READY_FOR_PICKUP', async (ctx, order, from) => {
      if (order.fulfillmentType !== 'DELIVERY' || from !== 'PREPARING') return;
      await this.createForOrder(ctx, order);
    });
    // Order cancelled / refunded before pickup → the job disappears.
    for (const status of ['CANCELLED', 'REFUND_PENDING'] as const) {
      this.sm.onEnter(status, async (ctx, order) => {
        const [d] = await ctx.tx
          .select()
          .from(deliveries)
          .where(eq(deliveries.orderId, order.id))
          .limit(1);
        if (d && (d.status === 'AVAILABLE' || d.status === 'ASSIGNED')) {
          await this.move(
            ctx,
            d,
            order,
            'CANCELLED',
            { userId: null, role: null },
            {
              reason: `order_${status.toLowerCase()}`,
            },
          );
        }
      });
    }
  }

  // ------------------------------------------------------------ creation

  private packageLabel() {
    let s = '';
    for (let i = 0; i < 6; i++)
      s += PACKAGE_ALPHABET[randomInt(PACKAGE_ALPHABET.length)];
    return `PKG-${s}`;
  }

  async createForOrder(ctx: TxContext, order: OrderRow) {
    const [ph] = await ctx.tx
      .select()
      .from(pharmacies)
      .where(eq(pharmacies.id, order.pharmacyId))
      .limit(1);
    const [patient] = await ctx.tx
      .select({ firstName: patientProfiles.firstName, phone: users.phone })
      .from(users)
      .leftJoin(patientProfiles, eq(patientProfiles.userId, users.id))
      .where(eq(users.id, order.patientUserId))
      .limit(1);
    const a = (order.deliveryAddressSnapshot ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
    const num = (v: unknown) =>
      v === null || v === undefined ? null : Number(v);

    const pickup: PickupSnapshot = {
      pharmacy_name: ph.nameFr,
      address: ph.addressLine,
      wilaya_id: ph.wilayaId,
      commune_id: ph.communeId,
      phone: ph.phone,
      latitude: ph.latitude,
      longitude: ph.longitude,
    };
    const dropoff: DropoffSnapshot = {
      first_name: patient?.firstName ?? '',
      phone: str(a.phone_contact) ?? patient?.phone ?? null,
      address: [str(a.street_line), str(a.building_details)]
        .filter(Boolean)
        .join(', '),
      wilaya_id: Number(a.wilaya_id),
      wilaya_name_fr: str(a.wilaya_name_fr),
      wilaya_name_ar: str(a.wilaya_name_ar),
      commune_id: Number(a.commune_id),
      commune_name_fr: str(a.commune_name_fr),
      commune_name_ar: str(a.commune_name_ar),
      latitude: num(a.latitude),
      longitude: num(a.longitude),
      notes: str(a.delivery_notes),
    };

    const id = randomUUID();
    const pickupCode = this.crypto.numericCode(6);
    const deliveryCode = this.crypto.numericCode(6);
    const [d] = await ctx.tx
      .insert(deliveries)
      .values({
        id,
        orderId: order.id,
        status: 'AVAILABLE',
        pickupSnapshot: pickup,
        dropoffSnapshot: dropoff,
        packageLabel: this.packageLabel(),
        deliveryFeeCentimes: order.deliveryFeeCentimes,
        // Assumption until the commercial model is decided: the driver receives the full delivery fee.
        driverPayoutCentimes: order.deliveryFeeCentimes,
        pickupCodeHash: this.crypto.hmac(pickupCodeInput(id, pickupCode)),
        deliveryCodeHash: this.crypto.hmac(deliveryCodeInput(id, deliveryCode)),
      })
      .returning();
    await ctx.tx.insert(deliveryStatusHistory).values({
      deliveryId: d.id,
      fromStatus: null,
      toStatus: 'AVAILABLE',
      reason: 'order_ready',
    });
    ctx.emit(DomainEvent.DELIVERY_CODE_ISSUED, {
      deliveryId: d.id,
      orderId: order.id,
      reference: order.reference,
      pharmacyId: order.pharmacyId,
      patientUserId: order.patientUserId,
      pickupCode,
      deliveryCode,
    });
    ctx.emit('delivery.job_available', {
      deliveryId: d.id,
      latitude: pickup.latitude,
      longitude: pickup.longitude,
    });
    await this.emitStatus(ctx, d, order, null, 'AVAILABLE');
    return d;
  }

  // --------------------------------------------------------- transitions

  /**
   * Moves a delivery (optimistic lock on version) and appends the history.
   * The caller applies the matching order transition in the same ctx.
   */
  async move(
    ctx: TxContext,
    d: DeliveryRow,
    order: Pick<OrderRow, 'id' | 'patientUserId' | 'pharmacyId'>,
    to: DeliveryStatus,
    actor: DeliveryActor,
    opts: {
      reason?: string | null;
      metadata?: Record<string, unknown>;
      set?: Partial<typeof deliveries.$inferInsert>;
    } = {},
  ): Promise<DeliveryRow> {
    const from = d.status as DeliveryStatus;
    if (!canMove(from, to))
      throw new AppException('DELIVERY_INVALID_TRANSITION', { from, to });
    const [updated] = await ctx.tx
      .update(deliveries)
      .set({ ...opts.set, status: to, version: d.version + 1 })
      .where(
        and(
          eq(deliveries.id, d.id),
          eq(deliveries.version, d.version),
          eq(deliveries.status, from),
        ),
      )
      .returning();
    if (!updated) throw new AppException('DELIVERY_VERSION_CONFLICT');
    await ctx.tx.insert(deliveryStatusHistory).values({
      deliveryId: d.id,
      fromStatus: from,
      toStatus: to,
      actorUserId: actor.userId,
      actorRole: actor.role,
      reason: opts.reason ?? null,
      metadata: opts.metadata ?? null,
    });
    await this.emitStatus(ctx, updated, order, from, to, d.driverId);
    return updated;
  }

  private async emitStatus(
    ctx: TxContext,
    d: DeliveryRow,
    order: Pick<OrderRow, 'id' | 'patientUserId' | 'pharmacyId'>,
    from: DeliveryStatus | null,
    to: DeliveryStatus,
    previousDriverId: string | null = null,
  ) {
    // The driver who just released / lost the job is told too.
    const driverId = d.driverId ?? previousDriverId;
    const [dr] = driverId
      ? await ctx.tx
          .select({ userId: drivers.userId })
          .from(drivers)
          .where(eq(drivers.id, driverId))
          .limit(1)
      : [];
    const event: DeliveryStatusChangedEvent = {
      deliveryId: d.id,
      orderId: order.id,
      patientUserId: order.patientUserId,
      pharmacyId: order.pharmacyId,
      driverUserId: dr?.userId ?? null,
      from,
      to,
    };
    ctx.emit(DomainEvent.DELIVERY_STATUS_CHANGED, event);
  }

  // ------------------------------------------------------------ loading

  async loadByOrder(orderId: string) {
    const [d] = await this.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.orderId, orderId))
      .limit(1);
    if (!d) throw new AppException('DELIVERY_NOT_FOUND');
    return d;
  }

  private async loadOrder(id: string) {
    const [o] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);
    if (!o) throw new AppException('ORDER_NOT_FOUND');
    return o;
  }

  private async driverSummary(driverId: string | null) {
    if (!driverId) return null;
    const [dr] = await this.db
      .select()
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    return dr ?? null;
  }

  // -------------------------------------------------------- patient view

  /** Status, driver first name + vehicle, ETA; live position only while OUT_FOR_DELIVERY. */
  async patientView(user: AuthUser, orderId: string) {
    const o = await this.loadOrder(orderId);
    if (o.patientUserId !== user.id) throw new AppException('ORDER_NOT_FOUND');
    const d = await this.loadByOrder(o.id);
    const dr = await this.driverSummary(d.driverId);
    const live =
      d.status === 'OUT_FOR_DELIVERY' &&
      dr?.currentLatitude != null &&
      dr.currentLongitude != null
        ? {
            latitude: dr.currentLatitude,
            longitude: dr.currentLongitude,
            updated_at: dr.lastLocationAt,
          }
        : null;
    return {
      delivery_id: d.id,
      order_id: o.id,
      status: d.status,
      package_label: d.packageLabel,
      driver: dr
        ? { first_name: dr.firstName, vehicle_type: dr.vehicleType }
        : null,
      estimated_arrival_at: d.estimatedArrivalAt,
      assigned_at: d.assignedAt,
      picked_up_at: d.pickedUpAt,
      delivered_at: d.deliveredAt,
      failure_reason:
        d.status === 'FAILED' || d.status === 'RETURNED'
          ? d.failureReason
          : null,
      proof_type: d.proofType,
      live_location: live,
    };
  }

  /** New delivery OTP for the patient (resets the attempt counter). */
  async regenerateDeliveryCode(user: AuthUser, orderId: string) {
    const o = await this.loadOrder(orderId);
    if (o.patientUserId !== user.id) throw new AppException('ORDER_NOT_FOUND');
    const d = await this.loadByOrder(o.id);
    if (
      !['AVAILABLE', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(
        d.status,
      )
    )
      throw new AppException('DELIVERY_INVALID_TRANSITION', {
        status: d.status,
      });
    const code = this.crypto.numericCode(6);
    await this.db
      .update(deliveries)
      .set({
        deliveryCodeHash: this.crypto.hmac(deliveryCodeInput(d.id, code)),
        deliveryCodeAttempts: 0,
      })
      .where(eq(deliveries.id, d.id));
    return { order_id: o.id, delivery_code: code };
  }

  // ------------------------------------------------------- pharmacy view

  private async loadForPharmacy(ph: PharmacyContext, orderId: string) {
    const o = await this.loadOrder(orderId);
    if (o.pharmacyId !== ph.id) throw new AppException('ORDER_NOT_FOUND');
    return { o, d: await this.loadByOrder(o.id) };
  }

  async pharmacyView(ph: PharmacyContext, orderId: string) {
    const { o, d } = await this.loadForPharmacy(ph, orderId);
    const dr = await this.driverSummary(d.driverId);
    return {
      delivery_id: d.id,
      order_id: o.id,
      status: d.status,
      package_label: d.packageLabel,
      driver: dr
        ? {
            first_name: dr.firstName,
            vehicle_type: dr.vehicleType,
            plate_number: dr.plateNumber,
          }
        : null,
      pickup_code_locked:
        d.pickupCodeAttempts >=
        (await this.settings.get('delivery_code_max_attempts')),
      assigned_at: d.assignedAt,
      picked_up_at: d.pickedUpAt,
      delivered_at: d.deliveredAt,
      failure_reason: d.failureReason,
      delivery_attempts: d.deliveryAttempts,
      returned_by_driver_at: d.returnedByDriverAt,
      return_confirmed_at: d.returnConfirmedAt,
    };
  }

  /** Fresh pickup code to show the driver (resets the attempt counter). */
  async regeneratePickupCode(ph: PharmacyContext, orderId: string) {
    const { o, d } = await this.loadForPharmacy(ph, orderId);
    if (d.status !== 'AVAILABLE' && d.status !== 'ASSIGNED')
      throw new AppException('DELIVERY_INVALID_TRANSITION', {
        status: d.status,
      });
    const code = this.crypto.numericCode(6);
    await this.db
      .update(deliveries)
      .set({
        pickupCodeHash: this.crypto.hmac(pickupCodeInput(d.id, code)),
        pickupCodeAttempts: 0,
      })
      .where(eq(deliveries.id, d.id));
    return { order_id: o.id, pickup_code: code };
  }

  /**
   * The pharmacy confirms the failed parcel is back on its premises:
   * delivery FAILED → RETURNED and order FAILED → REFUND_PENDING (automatic
   * refund request, see payments).
   */
  async confirmReturnByPharmacy(
    user: AuthUser,
    ph: PharmacyContext,
    orderId: string,
  ) {
    const { o } = await this.loadForPharmacy(ph, orderId);
    await this.uow.run(async (ctx) => {
      const [d] = await ctx.tx
        .select()
        .from(deliveries)
        .where(eq(deliveries.orderId, o.id))
        .limit(1);
      const [order] = await ctx.tx
        .select()
        .from(orders)
        .where(eq(orders.id, o.id))
        .limit(1);
      const actor = await this.sm.actorFor(user, order, ctx.tx);
      await this.move(
        ctx,
        d,
        order,
        'RETURNED',
        { userId: user.id, role: user.role },
        {
          reason: 'returned_to_pharmacy',
          set: { returnConfirmedAt: new Date() },
        },
      );
      await this.sm.apply(ctx, order, 'REFUND_PENDING', actor, {
        reason: `delivery_failed: ${d.failureReason ?? 'returned'}`,
        metadata: { delivery_id: d.id },
      });
    });
    return this.pharmacyView(ph, orderId);
  }

  // ---------------------------------------------------- notifications helpers

  async staffUserIds(pharmacyId: string) {
    const rows = await this.db.execute<{ user_id: string }>(
      sql`SELECT user_id FROM pharmacy_staff WHERE pharmacy_id = ${pharmacyId} AND is_active = true`,
    );
    return rows.rows.map((r) => r.user_id);
  }

  /**
   * Verified, available drivers near the pharmacy (30 km, or any driver whose
   * location is unknown) to tell about a new job – no address details sent.
   */
  async driversToAlert(latitude: number | null, longitude: number | null) {
    const near =
      latitude === null || longitude === null
        ? sql`true`
        : sql`(d.current_latitude IS NULL OR ST_DWithin(
              ST_SetSRID(ST_MakePoint(d.current_longitude, d.current_latitude), 4326)::geography,
              ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography, 30000))`;
    const rows = await this.db.execute<{ user_id: string }>(
      sql`SELECT d.user_id FROM drivers d
          JOIN users u ON u.id = d.user_id
          LEFT JOIN delivery_companies c ON c.id = d.company_id
          WHERE d.status = 'VERIFIED' AND d.is_available = true AND u.status = 'ACTIVE' AND u.deleted_at IS NULL
            AND (d.company_id IS NULL OR c.status = 'VERIFIED') AND ${near}
          LIMIT 50`,
    );
    return rows.rows.map((r) => r.user_id);
  }

  async driverUserId(driverId: string | null) {
    if (!driverId) return null;
    const [r] = await this.db
      .select({ userId: drivers.userId })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    return r?.userId ?? null;
  }
}
