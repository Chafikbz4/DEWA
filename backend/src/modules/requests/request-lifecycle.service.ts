import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { AppException } from '../../common/errors/app.exception';
import {
  DomainEvent,
  RequestStatusChangedEvent,
} from '../../common/events/domain-events';
import { TxContext } from '../../common/events/unit-of-work';
import { Database, DRIZZLE } from '../../database/database.module';
import { offers, requestRecipients, requests } from '../../database/schema';
import { AuditService } from '../audit/audit.service';

export type RequestStatus = (typeof requests.$inferSelect)['status'];

export const OPEN_REQUEST_STATUSES: RequestStatus[] = [
  'REQUEST_SUBMITTED',
  'AWAITING_PHARMACY_RESPONSE',
  'CLARIFICATION_REQUIRED',
  'OFFER_AVAILABLE',
];

/** Allowed request status edges (see docs/api/03-patient.md). */
export const REQUEST_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  REQUEST_SUBMITTED: ['AWAITING_PHARMACY_RESPONSE', 'CANCELLED', 'EXPIRED'],
  AWAITING_PHARMACY_RESPONSE: [
    'ACCEPTED',
    'CLARIFICATION_REQUIRED',
    'OFFER_AVAILABLE',
    'REJECTED',
    'CANCELLED',
    'EXPIRED',
  ],
  ACCEPTED: ['CANCELLED'],
  CLARIFICATION_REQUIRED: [
    'AWAITING_PHARMACY_RESPONSE',
    'OFFER_AVAILABLE',
    'CANCELLED',
    'EXPIRED',
  ],
  OFFER_AVAILABLE: [
    'OFFER_ACCEPTED',
    'CLARIFICATION_REQUIRED',
    'AWAITING_PHARMACY_RESPONSE',
    'CANCELLED',
    'EXPIRED',
  ],
  OFFER_ACCEPTED: ['CANCELLED'],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

/** Single place that changes request.status: validates the edge, audits, emits. */
@Injectable()
export class RequestLifecycleService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  canTransition(from: RequestStatus, to: RequestStatus) {
    return REQUEST_TRANSITIONS[from].includes(to);
  }

  /**
   * Conditional update (WHERE status = from) so concurrent changes cannot both
   * win. Returns false if the status changed meanwhile.
   */
  async transition(
    ctx: TxContext,
    request: {
      id: string;
      status: RequestStatus;
      reference: string;
      patientUserId: string;
    },
    to: RequestStatus,
    actor: {
      userId: string | null;
      role: string | null;
      reason?: string | null;
    },
    extra: Partial<typeof requests.$inferInsert> = {},
  ): Promise<boolean> {
    const { tx } = ctx;
    if (request.status === to) return true;
    if (!this.canTransition(request.status, to))
      throw new AppException('REQUEST_NOT_EDITABLE', {
        from: request.status,
        to,
      });
    const updated = await tx
      .update(requests)
      .set({ status: to, ...extra })
      .where(
        and(eq(requests.id, request.id), eq(requests.status, request.status)),
      )
      .returning({ id: requests.id });
    if (!updated.length) return false;

    if (to === 'CANCELLED' || to === 'EXPIRED') {
      await tx
        .update(requestRecipients)
        .set({ status: 'EXPIRED' })
        .where(
          and(
            eq(requestRecipients.requestId, request.id),
            inArray(requestRecipients.status, [
              'SENT',
              'VIEWED',
              'CLARIFICATION_ASKED',
            ]),
          ),
        );
      await tx
        .update(offers)
        .set({ status: 'EXPIRED' })
        .where(
          and(
            eq(offers.requestId, request.id),
            inArray(offers.status, ['DRAFT', 'SENT']),
          ),
        );
    }

    await this.audit.log(
      {
        action: 'REQUEST_STATUS_CHANGED',
        actorUserId: actor.userId,
        actorRole: (actor.role as never) ?? null,
        resourceType: 'request',
        resourceId: request.id,
        reason: actor.reason ?? null,
        metadata: { from: request.status, to },
      },
      tx === this.db ? undefined : tx,
    );

    const pharmacyRows = await tx
      .select({ id: requestRecipients.pharmacyId })
      .from(requestRecipients)
      .where(eq(requestRecipients.requestId, request.id));
    const payload: RequestStatusChangedEvent = {
      requestId: request.id,
      reference: request.reference,
      patientUserId: request.patientUserId,
      from: request.status,
      to,
      pharmacyIds: pharmacyRows.map((r) => r.id),
    };
    ctx.emit(DomainEvent.REQUEST_STATUS_CHANGED, payload);
    return true;
  }
}
