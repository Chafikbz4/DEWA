import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  sql,
  SQL,
} from 'drizzle-orm';
import type { AuthUser } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { CryptoService } from '../../common/crypto/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import { UnitOfWork } from '../../common/events/unit-of-work';
import { Paginated } from '../../common/http/envelope';
import { Database, DbOrTx, DRIZZLE } from '../../database/database.module';
import {
  deliveries,
  deliveryCompanies,
  deliveryStatusHistory,
  driverDocuments,
  drivers,
  orders,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import {
  Actor,
  OrderStateMachineService,
} from '../orders/order-state-machine.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { SettingsService } from '../settings/settings.service';
import { DRIVER_ACTIVE, DeliveryStatus } from './delivery-state';
import {
  deliveryCodeInput,
  DeliveryRow,
  DeliveryService,
  DropoffSnapshot,
  PickupSnapshot,
  pickupCodeInput,
} from './delivery.service';
import {
  AvailableJobsQueryDto,
  ConfirmDeliveryDto,
  DeliveryHistoryQueryDto,
  DriverDocumentDto,
  FailDeliveryDto,
  PeriodQueryDto,
} from './dto/delivery.dto';

type DriverRow = typeof drivers.$inferSelect;

const DAY = 86_400_000;

/** Period [from, to] inclusive (UTC days), default last 30 days. */
export function periodOf(q: PeriodQueryDto) {
  const to = q.to
    ? new Date(`${q.to.slice(0, 10)}T00:00:00Z`)
    : new Date(new Date().toISOString().slice(0, 10));
  const from = q.from
    ? new Date(`${q.from.slice(0, 10)}T00:00:00Z`)
    : new Date(to.getTime() - 29 * DAY);
  if (from > to)
    throw new AppException('VALIDATION_FAILED', { from: 'must be <= to' });
  return { from, toExclusive: new Date(to.getTime() + DAY) };
}

/** Public job card: pickup pharmacy, destination AREA only, money. */
export function presentAvailableJob(d: DeliveryRow, distanceKm: number | null) {
  const p = d.pickupSnapshot as PickupSnapshot;
  const t = d.dropoffSnapshot as DropoffSnapshot;
  return {
    id: d.id,
    status: d.status,
    package_label: d.packageLabel,
    pickup: {
      pharmacy_name: p.pharmacy_name,
      address: p.address,
      latitude: p.latitude,
      longitude: p.longitude,
    },
    destination_area: {
      wilaya_id: t.wilaya_id,
      wilaya_name_fr: t.wilaya_name_fr,
      wilaya_name_ar: t.wilaya_name_ar,
      commune_id: t.commune_id,
      commune_name_fr: t.commune_name_fr,
      commune_name_ar: t.commune_name_ar,
    },
    distance_to_pickup_km:
      distanceKm === null ? null : Math.round(distanceKm * 10) / 10,
    delivery_fee_centimes: d.deliveryFeeCentimes,
    driver_payout_centimes: d.driverPayoutCentimes,
    created_at: d.createdAt,
  };
}

/** Assigned driver view: full drop-off (name, phone, address) – still no medical data. */
export function presentAssignedJob(
  d: DeliveryRow,
  orderReference: string,
  maxAttempts: number,
) {
  const p = d.pickupSnapshot as PickupSnapshot;
  const t = d.dropoffSnapshot as DropoffSnapshot;
  return {
    id: d.id,
    order_reference: orderReference,
    status: d.status,
    package_label: d.packageLabel,
    pickup: p,
    dropoff: t,
    delivery_fee_centimes: d.deliveryFeeCentimes,
    driver_payout_centimes: d.driverPayoutCentimes,
    pickup_code_attempts_remaining: Math.max(
      0,
      maxAttempts - d.pickupCodeAttempts,
    ),
    delivery_code_attempts_remaining: Math.max(
      0,
      maxAttempts - d.deliveryCodeAttempts,
    ),
    assigned_at: d.assignedAt,
    picked_up_at: d.pickedUpAt,
    estimated_arrival_at: d.estimatedArrivalAt,
    delivered_at: d.deliveredAt,
    failure_reason: d.failureReason,
    delivery_attempts: d.deliveryAttempts,
    proof_type: d.proofType,
    returned_by_driver_at: d.returnedByDriverAt,
    return_confirmed_at: d.returnConfirmedAt,
  };
}

/** Everything a DRIVER does: profile, availability, documents, job board, execution, history, earnings. */
@Injectable()
export class DriverJobsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly uow: UnitOfWork,
    private readonly sm: OrderStateMachineService,
    private readonly delivery: DeliveryService,
    private readonly crypto: CryptoService,
    private readonly settings: SettingsService,
    private readonly files: FilesService,
    private readonly realtime: RealtimeGateway,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------ profile

  async driverOf(user: AuthUser): Promise<DriverRow> {
    const [d] = await this.db
      .select()
      .from(drivers)
      .where(eq(drivers.userId, user.id))
      .limit(1);
    if (!d) throw new AppException('DRIVER_PROFILE_NOT_FOUND');
    return d;
  }

  /** Unverified drivers (or drivers of an unverified company) see no jobs. */
  private async verifiedDriver(user: AuthUser) {
    const d = await this.driverOf(user);
    if (d.status !== 'VERIFIED' || user.status !== 'ACTIVE')
      throw new AppException('DRIVER_NOT_VERIFIED');
    if (d.companyId) {
      const [c] = await this.db
        .select({ status: deliveryCompanies.status })
        .from(deliveryCompanies)
        .where(eq(deliveryCompanies.id, d.companyId))
        .limit(1);
      if (c?.status !== 'VERIFIED')
        throw new AppException('DRIVER_NOT_VERIFIED');
    }
    return d;
  }

  private actor(user: AuthUser): Actor {
    return { kind: 'DRIVER', userId: user.id, role: user.role };
  }

  async me(user: AuthUser) {
    const d = await this.driverOf(user);
    const [company] = d.companyId
      ? await this.db
          .select({
            id: deliveryCompanies.id,
            name: deliveryCompanies.name,
            status: deliveryCompanies.status,
          })
          .from(deliveryCompanies)
          .where(eq(deliveryCompanies.id, d.companyId))
      : [];
    const docs = await this.db
      .select()
      .from(driverDocuments)
      .where(eq(driverDocuments.driverId, d.id))
      .orderBy(desc(driverDocuments.createdAt));
    return {
      id: d.id,
      first_name: d.firstName,
      last_name: d.lastName,
      vehicle_type: d.vehicleType,
      plate_number: d.plateNumber,
      license_number_masked: d.licenseNumberEncrypted
        ? CryptoService.mask(this.crypto.decrypt(d.licenseNumberEncrypted))
        : null,
      status: d.status,
      account_status: user.status,
      is_available: d.isAvailable,
      can_take_jobs:
        d.status === 'VERIFIED' &&
        user.status === 'ACTIVE' &&
        (!company || company.status === 'VERIFIED'),
      company: company ?? null,
      last_location_at: d.lastLocationAt,
      documents: docs.map((x) => ({
        id: x.id,
        doc_type: x.docType,
        file_id: x.fileId,
        review_status: x.reviewStatus,
        review_note: x.reviewNote,
        created_at: x.createdAt,
      })),
    };
  }

  async addDocument(user: AuthUser, dto: DriverDocumentDto) {
    const d = await this.driverOf(user);
    await this.files.assertUsable(user.id, [dto.file_id], ['DRIVER_DOC']);
    const [row] = await this.db
      .insert(driverDocuments)
      .values({ driverId: d.id, docType: dto.doc_type, fileId: dto.file_id })
      .returning();
    return {
      id: row.id,
      doc_type: row.docType,
      file_id: row.fileId,
      review_status: row.reviewStatus,
      created_at: row.createdAt,
    };
  }

  async setAvailability(user: AuthUser, isAvailable: boolean) {
    const d = isAvailable
      ? await this.verifiedDriver(user)
      : await this.driverOf(user);
    await this.db
      .update(drivers)
      .set({ isAvailable })
      .where(eq(drivers.id, d.id));
    return { is_available: isAvailable };
  }

  /** Throttled position update; streamed to the patient only while OUT_FOR_DELIVERY. */
  async updateLocation(user: AuthUser, latitude: number, longitude: number) {
    const d = await this.verifiedDriver(user);
    const interval = await this.settings.get(
      'driver_location_min_interval_seconds',
    );
    const now = new Date();
    const [updated] = await this.db
      .update(drivers)
      .set({
        currentLatitude: latitude,
        currentLongitude: longitude,
        lastLocationAt: now,
      })
      .where(
        and(
          eq(drivers.id, d.id),
          sql`(${drivers.lastLocationAt} IS NULL OR ${drivers.lastLocationAt} <= ${new Date(now.getTime() - interval * 1000)})`,
        ),
      )
      .returning({ id: drivers.id });
    if (!updated) {
      const retry = d.lastLocationAt
        ? Math.max(
            1,
            Math.ceil(
              interval - (now.getTime() - d.lastLocationAt.getTime()) / 1000,
            ),
          )
        : interval;
      throw new AppException('DELIVERY_LOCATION_THROTTLED', {
        retry_after_seconds: retry,
      });
    }
    const live = await this.db
      .select({
        orderId: deliveries.orderId,
        patientUserId: orders.patientUserId,
      })
      .from(deliveries)
      .innerJoin(orders, eq(orders.id, deliveries.orderId))
      .where(
        and(
          eq(deliveries.driverId, d.id),
          eq(deliveries.status, 'OUT_FOR_DELIVERY'),
        ),
      );
    for (const l of live) {
      this.realtime.emitToUser(l.patientUserId, 'delivery.location', {
        order_id: l.orderId,
        latitude,
        longitude,
        updated_at: now.toISOString(),
      });
    }
    return { accepted: true, updated_at: now };
  }

  // ---------------------------------------------------------- job board

  async available(user: AuthUser, q: AvailableJobsQueryDto) {
    const d = await this.verifiedDriver(user);
    const hasLoc = d.currentLatitude !== null && d.currentLongitude !== null;
    const pickupPoint = sql`ST_SetSRID(ST_MakePoint((${deliveries.pickupSnapshot}->>'longitude')::float8, (${deliveries.pickupSnapshot}->>'latitude')::float8), 4326)::geography`;
    const driverPoint = sql`ST_SetSRID(ST_MakePoint(${d.currentLongitude}, ${d.currentLatitude}), 4326)::geography`;
    const distance = hasLoc
      ? sql<
          number | null
        >`CASE WHEN ${deliveries.pickupSnapshot}->>'latitude' IS NULL THEN NULL ELSE ST_Distance(${pickupPoint}, ${driverPoint}) / 1000 END`
      : sql<number | null>`NULL::float8`;

    const conditions: SQL[] = [
      eq(deliveries.status, 'AVAILABLE'),
      eq(orders.status, 'READY_FOR_PICKUP'),
    ];
    if (q.wilaya_id)
      conditions.push(
        sql`(${deliveries.dropoffSnapshot}->>'wilaya_id')::int = ${q.wilaya_id}`,
      );
    if (q.commune_id)
      conditions.push(
        sql`(${deliveries.dropoffSnapshot}->>'commune_id')::int = ${q.commune_id}`,
      );
    if (hasLoc)
      conditions.push(
        sql`(${deliveries.pickupSnapshot}->>'latitude' IS NULL OR ST_DWithin(${pickupPoint}, ${driverPoint}, ${q.radius_km * 1000}))`,
      );
    const where = and(...conditions);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ d: deliveries, distance })
        .from(deliveries)
        .innerJoin(orders, eq(orders.id, deliveries.orderId))
        .where(where)
        .orderBy(
          hasLoc
            ? sql`${distance} ASC NULLS LAST`
            : q.order === 'asc'
              ? deliveries.createdAt
              : desc(deliveries.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db
        .select({ total: count() })
        .from(deliveries)
        .innerJoin(orders, eq(orders.id, deliveries.orderId))
        .where(where),
    ]);
    return Paginated.of(
      rows.map((r) =>
        presentAvailableJob(
          r.d,
          r.distance === null ? null : Number(r.distance),
        ),
      ),
      total,
      q.page,
      q.limit,
    );
  }

  private async maxAttempts() {
    return this.settings.get('delivery_code_max_attempts');
  }

  /** A job of mine (assigned to me), or an AVAILABLE job (public card). */
  async get(user: AuthUser, id: string) {
    const d = await this.driverOf(user);
    const [row] = await this.db
      .select({ d: deliveries, ref: orders.reference })
      .from(deliveries)
      .innerJoin(orders, eq(orders.id, deliveries.orderId))
      .where(eq(deliveries.id, id))
      .limit(1);
    if (row && row.d.driverId === d.id)
      return presentAssignedJob(row.d, row.ref, await this.maxAttempts());
    if (row && row.d.status === 'AVAILABLE') {
      await this.verifiedDriver(user);
      return presentAvailableJob(row.d, null);
    }
    throw new AppException('DELIVERY_NOT_FOUND');
  }

  async active(user: AuthUser) {
    const d = await this.driverOf(user);
    const rows = await this.db
      .select({ d: deliveries, ref: orders.reference })
      .from(deliveries)
      .innerJoin(orders, eq(orders.id, deliveries.orderId))
      .where(
        and(
          eq(deliveries.driverId, d.id),
          sql`(${inArray(deliveries.status, DRIVER_ACTIVE)} OR (${deliveries.status} = 'FAILED' AND ${deliveries.returnConfirmedAt} IS NULL))`,
        ),
      )
      .orderBy(desc(deliveries.assignedAt));
    const max = await this.maxAttempts();
    return rows.map((r) => presentAssignedJob(r.d, r.ref, max));
  }

  /** Loads my job inside a unit of work with its order. */
  private async mine(tx: DbOrTx, driver: DriverRow, id: string) {
    const [row] = await tx
      .select({ d: deliveries, o: orders })
      .from(deliveries)
      .innerJoin(orders, eq(orders.id, deliveries.orderId))
      .where(eq(deliveries.id, id))
      .limit(1);
    if (!row || row.d.driverId !== driver.id)
      throw new AppException('DELIVERY_NOT_FOUND');
    return row;
  }

  private async view(id: string) {
    const [row] = await this.db
      .select({ d: deliveries, ref: orders.reference })
      .from(deliveries)
      .innerJoin(orders, eq(orders.id, deliveries.orderId))
      .where(eq(deliveries.id, id));
    return presentAssignedJob(row.d, row.ref, await this.maxAttempts());
  }

  /** First come, first served: the optimistic lock lets exactly one driver win. */
  async accept(user: AuthUser, id: string, meta: RequestMeta) {
    const driver = await this.verifiedDriver(user);
    if (!driver.isAvailable) throw new AppException('DRIVER_NOT_AVAILABLE');
    await this.uow
      .run(async (ctx) => {
        const [row] = await ctx.tx
          .select({ d: deliveries, o: orders })
          .from(deliveries)
          .innerJoin(orders, eq(orders.id, deliveries.orderId))
          .where(eq(deliveries.id, id))
          .limit(1);
        if (!row) throw new AppException('DELIVERY_NOT_FOUND');
        if (row.d.status !== 'AVAILABLE')
          throw new AppException('DELIVERY_ALREADY_TAKEN');
        await this.delivery.move(
          ctx,
          row.d,
          row.o,
          'ASSIGNED',
          { userId: user.id, role: user.role },
          {
            set: {
              driverId: driver.id,
              companyId: driver.companyId,
              assignedAt: new Date(),
            },
          },
        );
        await this.sm.apply(ctx, row.o, 'DELIVERY_ASSIGNED', this.actor(user), {
          metadata: { delivery_id: id },
        });
        await this.audit.log(
          {
            action: 'DELIVERY_ACCEPTED',
            actorUserId: user.id,
            actorRole: user.role,
            resourceType: 'delivery',
            resourceId: id,
            ip: meta.ip,
            userAgent: meta.userAgent,
          },
          ctx.tx,
        );
      })
      .catch((err: { code?: string }) => {
        if (
          err.code === 'DELIVERY_VERSION_CONFLICT' ||
          err.code === 'ORDER_VERSION_CONFLICT' ||
          err.code === 'DELIVERY_INVALID_TRANSITION'
        ) {
          throw new AppException('DELIVERY_ALREADY_TAKEN');
        }
        throw err;
      });
    return this.view(id);
  }

  /** Give a job back before pickup (reason + daily limit). */
  async release(user: AuthUser, id: string, reason: string) {
    const driver = await this.driverOf(user);
    const max = await this.settings.get('delivery_max_releases_per_day');
    const startOfDay = new Date(new Date().toISOString().slice(0, 10));
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(deliveryStatusHistory)
      .where(
        and(
          eq(deliveryStatusHistory.actorUserId, user.id),
          eq(deliveryStatusHistory.fromStatus, 'ASSIGNED'),
          eq(deliveryStatusHistory.toStatus, 'AVAILABLE'),
          gte(deliveryStatusHistory.createdAt, startOfDay),
        ),
      );
    if (n >= max)
      throw new AppException('DELIVERY_RELEASE_LIMIT_REACHED', { limit: max });
    await this.uow.run(async (ctx) => {
      const { d, o } = await this.mine(ctx.tx, driver, id);
      if (d.status !== 'ASSIGNED')
        throw new AppException('DELIVERY_INVALID_TRANSITION', {
          from: d.status,
          to: 'AVAILABLE',
        });
      await this.delivery.move(
        ctx,
        d,
        o,
        'AVAILABLE',
        { userId: user.id, role: user.role },
        {
          reason,
          metadata: { action: 'release' },
          set: { driverId: null, companyId: null, assignedAt: null },
        },
      );
      await this.sm.apply(ctx, o, 'READY_FOR_PICKUP', this.actor(user), {
        reason: `driver_released: ${reason}`,
        metadata: { delivery_id: id },
      });
    });
    return {
      id,
      status: 'AVAILABLE' as DeliveryStatus,
      releases_left_today: Math.max(0, max - n - 1),
    };
  }

  /**
   * Shared code check with lockout. Wrong attempts are persisted OUTSIDE the
   * transition so they count even though the request fails.
   */
  private async checkCode(
    d: DeliveryRow,
    kind: 'pickup' | 'delivery',
    code: string,
  ) {
    const max = await this.maxAttempts();
    const attempts =
      kind === 'pickup' ? d.pickupCodeAttempts : d.deliveryCodeAttempts;
    const hash = kind === 'pickup' ? d.pickupCodeHash : d.deliveryCodeHash;
    if (attempts >= max) throw new AppException('DELIVERY_CODE_LOCKED');
    const input =
      kind === 'pickup'
        ? pickupCodeInput(d.id, code)
        : deliveryCodeInput(d.id, code);
    if (hash && this.crypto.hmacEquals(input, hash)) return;
    const column =
      kind === 'pickup'
        ? deliveries.pickupCodeAttempts
        : deliveries.deliveryCodeAttempts;
    await this.db
      .update(deliveries)
      .set(
        kind === 'pickup'
          ? { pickupCodeAttempts: sql`${column} + 1` }
          : { deliveryCodeAttempts: sql`${column} + 1` },
      )
      .where(eq(deliveries.id, d.id));
    if (attempts + 1 >= max) throw new AppException('DELIVERY_CODE_LOCKED');
    throw new AppException('DELIVERY_CODE_INVALID', {
      attempts_remaining: max - attempts - 1,
    });
  }

  async confirmPickup(user: AuthUser, id: string, code: string) {
    const driver = await this.verifiedDriver(user);
    const pre = await this.mine(this.db, driver, id);
    if (pre.d.status !== 'ASSIGNED')
      throw new AppException('DELIVERY_INVALID_TRANSITION', {
        from: pre.d.status,
        to: 'PICKED_UP',
      });
    await this.checkCode(pre.d, 'pickup', code);
    await this.uow.run(async (ctx) => {
      const { d, o } = await this.mine(ctx.tx, driver, id);
      await this.delivery.move(
        ctx,
        d,
        o,
        'PICKED_UP',
        { userId: user.id, role: user.role },
        { set: { pickedUpAt: new Date(), pickupCodeHash: null } },
      );
      await this.sm.apply(ctx, o, 'PICKED_UP', this.actor(user), {
        metadata: { delivery_id: id },
      });
    });
    return this.view(id);
  }

  async start(user: AuthUser, id: string, etaMinutes?: number) {
    const driver = await this.verifiedDriver(user);
    await this.uow.run(async (ctx) => {
      const { d, o } = await this.mine(ctx.tx, driver, id);
      await this.delivery.move(
        ctx,
        d,
        o,
        'OUT_FOR_DELIVERY',
        { userId: user.id, role: user.role },
        {
          set: {
            estimatedArrivalAt: etaMinutes
              ? new Date(Date.now() + etaMinutes * 60_000)
              : null,
          },
        },
      );
      await this.sm.apply(ctx, o, 'OUT_FOR_DELIVERY', this.actor(user), {
        metadata: { delivery_id: id },
      });
    });
    return this.view(id);
  }

  /** DELIVERED requires exactly one valid proof: patient OTP, signature or a photo without faces. */
  async confirmDelivery(user: AuthUser, id: string, dto: ConfirmDeliveryDto) {
    const driver = await this.verifiedDriver(user);
    const proofs = [
      dto.delivery_code,
      dto.signature_file_id,
      dto.photo_file_id,
    ].filter(Boolean);
    if (proofs.length !== 1) throw new AppException('DELIVERY_PROOF_REQUIRED');
    const pre = await this.mine(this.db, driver, id);
    if (pre.d.status !== 'OUT_FOR_DELIVERY')
      throw new AppException('DELIVERY_INVALID_TRANSITION', {
        from: pre.d.status,
        to: 'DELIVERED',
      });

    let proofType: 'OTP' | 'SIGNATURE' | 'PHOTO_NO_FACE';
    let proofFileId: string | null = null;
    if (dto.delivery_code) {
      await this.checkCode(pre.d, 'delivery', dto.delivery_code);
      proofType = 'OTP';
    } else {
      proofFileId = (dto.signature_file_id ?? dto.photo_file_id)!;
      await this.files.assertUsable(
        user.id,
        [proofFileId],
        ['PROOF_OF_DELIVERY'],
      );
      proofType = dto.signature_file_id ? 'SIGNATURE' : 'PHOTO_NO_FACE';
    }
    await this.uow.run(async (ctx) => {
      const { d, o } = await this.mine(ctx.tx, driver, id);
      await this.delivery.move(
        ctx,
        d,
        o,
        'DELIVERED',
        { userId: user.id, role: user.role },
        {
          metadata: { proof_type: proofType },
          set: {
            deliveredAt: new Date(),
            proofType,
            proofFileId,
            deliveryCodeHash: null,
          },
        },
      );
      await this.sm.apply(ctx, o, 'DELIVERED', this.actor(user), {
        metadata: { delivery_id: id, proof_type: proofType },
      });
    });
    return this.view(id);
  }

  async fail(user: AuthUser, id: string, dto: FailDeliveryDto) {
    const driver = await this.verifiedDriver(user);
    await this.uow.run(async (ctx) => {
      const { d, o } = await this.mine(ctx.tx, driver, id);
      await this.delivery.move(
        ctx,
        d,
        o,
        'FAILED',
        { userId: user.id, role: user.role },
        {
          reason: dto.reason,
          metadata: { attempts: dto.attempts },
          set: { failureReason: dto.reason, deliveryAttempts: dto.attempts },
        },
      );
      await this.sm.apply(ctx, o, 'FAILED', this.actor(user), {
        reason: dto.reason,
        metadata: { delivery_id: id, attempts: dto.attempts },
      });
    });
    return this.view(id);
  }

  /** Driver states the parcel is back at the pharmacy; the pharmacy then confirms receipt. */
  async confirmReturn(user: AuthUser, id: string) {
    const driver = await this.driverOf(user);
    const { d } = await this.mine(this.db, driver, id);
    if (d.status !== 'FAILED')
      throw new AppException('DELIVERY_INVALID_TRANSITION', {
        from: d.status,
        to: 'RETURNED',
      });
    if (!d.returnedByDriverAt)
      await this.db
        .update(deliveries)
        .set({ returnedByDriverAt: new Date() })
        .where(eq(deliveries.id, d.id));
    return this.view(id);
  }

  // ---------------------------------------------------- history & earnings

  async history(user: AuthUser, q: DeliveryHistoryQueryDto) {
    const driver = await this.driverOf(user);
    const conditions: SQL[] = [eq(deliveries.driverId, driver.id)];
    conditions.push(
      q.status
        ? eq(deliveries.status, q.status)
        : inArray(deliveries.status, [
            'DELIVERED',
            'FAILED',
            'RETURNED',
            'CANCELLED',
          ]),
    );
    const where = and(...conditions);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({ d: deliveries, ref: orders.reference })
        .from(deliveries)
        .innerJoin(orders, eq(orders.id, deliveries.orderId))
        .where(where)
        .orderBy(
          q.order === 'asc' ? deliveries.updatedAt : desc(deliveries.updatedAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(deliveries).where(where),
    ]);
    return Paginated.of(
      rows.map((r) => {
        const t = r.d.dropoffSnapshot as DropoffSnapshot;
        return {
          id: r.d.id,
          order_reference: r.ref,
          status: r.d.status,
          package_label: r.d.packageLabel,
          pharmacy_name: (r.d.pickupSnapshot as PickupSnapshot).pharmacy_name,
          destination_area: {
            commune_name_fr: t.commune_name_fr,
            commune_name_ar: t.commune_name_ar,
            wilaya_name_fr: t.wilaya_name_fr,
          },
          driver_payout_centimes:
            r.d.status === 'DELIVERED' ? r.d.driverPayoutCentimes : 0,
          assigned_at: r.d.assignedAt,
          delivered_at: r.d.deliveredAt,
          failure_reason: r.d.failureReason,
        };
      }),
      total,
      q.page,
      q.limit,
    );
  }

  /** Payouts of DELIVERED jobs per UTC day (records; payment of drivers is off-platform). */
  async earnings(user: AuthUser, q: PeriodQueryDto) {
    const driver = await this.driverOf(user);
    const { from, toExclusive } = periodOf(q);
    const where = and(
      eq(deliveries.driverId, driver.id),
      eq(deliveries.status, 'DELIVERED'),
      isNotNull(deliveries.deliveredAt),
      gte(deliveries.deliveredAt, from),
      lt(deliveries.deliveredAt, toExclusive),
    );
    const day = sql<string>`to_char(${deliveries.deliveredAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({
        day,
        deliveries: sql<number>`count(*)::int`,
        payout: sql<number>`coalesce(sum(${deliveries.driverPayoutCentimes}), 0)::bigint`,
      })
      .from(deliveries)
      .where(where)
      .groupBy(day)
      .orderBy(day);
    const days = rows.map((r) => ({
      date: r.day,
      deliveries: r.deliveries,
      payout_centimes: Number(r.payout),
    }));
    return {
      from: from.toISOString().slice(0, 10),
      to: new Date(toExclusive.getTime() - DAY).toISOString().slice(0, 10),
      total_deliveries: days.reduce((s, d) => s + d.deliveries, 0),
      total_payout_centimes: days.reduce((s, d) => s + d.payout_centimes, 0),
      currency: 'DZD',
      days,
      records_only: true,
    };
  }
}
