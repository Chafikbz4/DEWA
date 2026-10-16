import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { AuthUser } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import {
  DomainEvent,
  OrderStatusChangedEvent,
} from '../../common/events/domain-events';
import { TxContext, UnitOfWork } from '../../common/events/unit-of-work';
import { Database, DbOrTx, DRIZZLE } from '../../database/database.module';
import {
  deliveries,
  drivers,
  orders,
  orderStatusHistory,
  pharmacyStaff,
  requests,
  Role,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { RequestLifecycleService } from '../requests/request-lifecycle.service';
import {
  ActorKind,
  checkTransition,
  findTransition,
  OrderStatus,
  WorkflowVariant,
} from './order-state-machine';

export type OrderRow = typeof orders.$inferSelect;

export interface Actor {
  kind: ActorKind;
  userId: string | null;
  role: Role | null;
}

export const SYSTEM_ACTOR: Actor = { kind: 'SYSTEM', userId: null, role: null };

export interface TransitionOptions {
  reason?: string | null;
  metadata?: Record<string, unknown>;
  /** Extra columns written with the status (validation fields, deadlines…). */
  set?: Partial<typeof orders.$inferInsert>;
}

/** Runs inside the transition's DB transaction, after the status was written. */
export type EnterHook = (
  ctx: TxContext,
  order: OrderRow,
  from: OrderStatus,
  actor: Actor,
) => Promise<void>;

/**
 * THE ONLY WAY to change orders.status. Each call validates the edge for the
 * order's workflow variant and the actor, updates with an optimistic lock
 * (version), appends order_status_history, runs registered side effects,
 * audits, and emits order.status_changed after COMMIT.
 */
@Injectable()
export class OrderStateMachineService {
  private readonly hooks = new Map<OrderStatus, EnterHook[]>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly uow: UnitOfWork,
    private readonly audit: AuditService,
    private readonly lifecycle: RequestLifecycleService,
  ) {
    // An order that ends without hand-over closes its request.
    for (const status of ['CANCELLED', 'REFUNDED'] as OrderStatus[]) {
      this.onEnter(status, async (ctx, order) => {
        const [r] = await ctx.tx
          .select()
          .from(requests)
          .where(eq(requests.id, order.requestId))
          .limit(1);
        if (r?.status === 'OFFER_ACCEPTED') {
          await this.lifecycle.transition(
            ctx,
            r,
            'CANCELLED',
            {
              userId: null,
              role: null,
              reason: `order_${status.toLowerCase()}`,
            },
            { cancelledAt: new Date() },
          );
        }
      });
    }
  }

  /** Other modules (payments, delivery, notifications) plug side effects here. */
  onEnter(status: OrderStatus, hook: EnterHook) {
    this.hooks.set(status, [...(this.hooks.get(status) ?? []), hook]);
  }

  /** Who is acting on this order (throws ORDER_NOT_FOUND if not a party). */
  async actorFor(
    user: AuthUser,
    order: OrderRow,
    tx: DbOrTx = this.db,
  ): Promise<Actor> {
    const base = { userId: user.id, role: user.role };
    if (user.role === 'PATIENT' && order.patientUserId === user.id)
      return { ...base, kind: 'PATIENT' };
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN')
      return { ...base, kind: 'ADMIN' };
    if (user.role === 'DRIVER') {
      const [d] = await tx
        .select({ id: deliveries.id })
        .from(deliveries)
        .innerJoin(drivers, eq(drivers.id, deliveries.driverId))
        .where(
          and(eq(deliveries.orderId, order.id), eq(drivers.userId, user.id)),
        )
        .limit(1);
      if (d) return { ...base, kind: 'DRIVER' };
    }
    const [staff] = await tx
      .select({ staffRole: pharmacyStaff.staffRole })
      .from(pharmacyStaff)
      .where(
        and(
          eq(pharmacyStaff.pharmacyId, order.pharmacyId),
          eq(pharmacyStaff.userId, user.id),
          eq(pharmacyStaff.isActive, true),
        ),
      )
      .limit(1);
    if (staff)
      return {
        ...base,
        kind: staff.staffRole === 'ASSISTANT' ? 'PHARMACY' : 'PHARMACIST',
      };
    throw new AppException('ORDER_NOT_FOUND');
  }

  /** Transition inside an existing unit of work. */
  async apply(
    ctx: TxContext,
    order: OrderRow,
    to: OrderStatus,
    actor: Actor,
    opts: TransitionOptions = {},
  ): Promise<OrderRow> {
    const variant = order.workflowVariant as WorkflowVariant;
    const from = order.status as OrderStatus;
    const check = checkTransition(variant, from, to, actor.kind);
    if (check === 'INVALID_TRANSITION')
      throw new AppException('ORDER_INVALID_TRANSITION', { from, to });
    if (check === 'FORBIDDEN')
      throw new AppException('ORDER_ACTION_FORBIDDEN', { from, to });
    if (findTransition(variant, from, to)!.reasonRequired && !opts.reason)
      throw new AppException('ORDER_REASON_REQUIRED');

    const now = new Date();
    const [updated] = await ctx.tx
      .update(orders)
      .set({
        ...opts.set,
        status: to,
        version: order.version + 1,
        statusChangedAt: now,
      })
      .where(
        and(
          eq(orders.id, order.id),
          eq(orders.version, order.version),
          eq(orders.status, from),
        ),
      )
      .returning();
    if (!updated) throw new AppException('ORDER_VERSION_CONFLICT');

    await ctx.tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: from,
      toStatus: to,
      actorUserId: actor.userId,
      actorRole: actor.role,
      reason: opts.reason ?? null,
      metadata: { actor_kind: actor.kind, ...(opts.metadata ?? {}) },
    });

    for (const hook of this.hooks.get(to) ?? [])
      await hook(ctx, updated, from, actor);

    await this.audit.log(
      {
        action: 'ORDER_STATUS_CHANGED',
        actorUserId: actor.userId,
        actorRole: actor.role,
        resourceType: 'order',
        resourceId: order.id,
        reason: opts.reason ?? null,
        metadata: { from, to, actor_kind: actor.kind },
      },
      ctx.tx,
    );
    const event: OrderStatusChangedEvent = {
      orderId: order.id,
      reference: order.reference,
      patientUserId: order.patientUserId,
      pharmacyId: order.pharmacyId,
      from,
      to,
      actorUserId: actor.userId,
    };
    ctx.emit(DomainEvent.ORDER_STATUS_CHANGED, event);
    return updated;
  }

  /** Transition in its own transaction (reloads the order first). */
  async transition(
    orderId: string,
    to: OrderStatus,
    actor: Actor,
    opts: TransitionOptions = {},
  ): Promise<OrderRow> {
    return this.uow.run(async (ctx) => {
      const [order] = await ctx.tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      if (!order) throw new AppException('ORDER_NOT_FOUND');
      return this.apply(ctx, order, to, actor, opts);
    });
  }

  /** Chain of transitions in one transaction (e.g. PAYMENT_CONFIRMED → PHARMACIST_VALIDATION_PENDING). */
  async applyChain(
    ctx: TxContext,
    order: OrderRow,
    steps: { to: OrderStatus; actor: Actor; opts?: TransitionOptions }[],
  ) {
    let current = order;
    for (const s of steps)
      current = await this.apply(ctx, current, s.to, s.actor, s.opts);
    return current;
  }
}
