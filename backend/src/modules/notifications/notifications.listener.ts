import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { and, eq, inArray } from 'drizzle-orm';
import {
  DomainEvent,
  MessageCreatedEvent,
  OfferEvent,
  RequestStatusChangedEvent,
} from '../../common/events/domain-events';
import { Database, DRIZZLE } from '../../database/database.module';
import { pharmacyStaff, requests } from '../../database/schema';
import { NotificationsService, NotifyInput } from './notifications.service';

/**
 * Turns domain events into notifications. Templates only carry references
 * and statuses – never medicine names or medical content.
 */
@Injectable()
export class NotificationsListener {
  private readonly logger = new Logger('NotificationsListener');

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notifications: NotificationsService,
  ) {}

  /** Active staff of the given pharmacies. */
  async staffOf(
    pharmacyIds: string[],
    roles: ('OWNER' | 'PHARMACIST' | 'ASSISTANT')[] = [
      'OWNER',
      'PHARMACIST',
      'ASSISTANT',
    ],
  ) {
    if (!pharmacyIds.length) return [];
    const rows = await this.db
      .select({ userId: pharmacyStaff.userId })
      .from(pharmacyStaff)
      .where(
        and(
          inArray(pharmacyStaff.pharmacyId, pharmacyIds),
          eq(pharmacyStaff.isActive, true),
          inArray(pharmacyStaff.staffRole, roles),
        ),
      );
    return rows.map((r) => r.userId);
  }

  private async send(input: NotifyInput) {
    try {
      await this.notifications.notify(input);
    } catch (err) {
      // Notifications must never break the business flow that triggered them.
      this.logger.error(
        `notify ${input.type} failed: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent(DomainEvent.REQUEST_CREATED, { async: true })
  async onRequestCreated(e: { requestId: string; pharmacyIds: string[] }) {
    const [r] = await this.db
      .select({ reference: requests.reference })
      .from(requests)
      .where(eq(requests.id, e.requestId))
      .limit(1);
    await this.send({
      userIds: await this.staffOf(e.pharmacyIds),
      type: 'REQUEST_RECEIVED',
      params: { reference: r?.reference ?? '' },
      data: { request_id: e.requestId },
    });
  }

  @OnEvent(DomainEvent.REQUEST_STATUS_CHANGED, { async: true })
  async onRequestStatus(e: RequestStatusChangedEvent) {
    const base = {
      params: { reference: e.reference },
      data: { request_id: e.requestId },
    };
    if (e.to === 'CLARIFICATION_REQUIRED')
      await this.send({
        ...base,
        userIds: [e.patientUserId],
        type: 'CLARIFICATION_REQUESTED',
      });
    if (e.to === 'EXPIRED')
      await this.send({
        ...base,
        userIds: [e.patientUserId],
        type: 'REQUEST_EXPIRED',
      });
    if (e.to === 'CANCELLED')
      await this.send({
        ...base,
        userIds: await this.staffOf(e.pharmacyIds),
        type: 'REQUEST_CANCELLED',
      });
  }

  @OnEvent(DomainEvent.OFFER_SENT, { async: true })
  async onOffer(e: OfferEvent) {
    await this.send({
      userIds: [e.patientUserId],
      type: 'OFFER_RECEIVED',
      params: { reference: e.reference },
      data: { request_id: e.requestId, offer_id: e.offerId },
    });
  }

  @OnEvent(DomainEvent.MESSAGE_CREATED, { async: true })
  async onMessage(e: MessageCreatedEvent) {
    // System messages and clarification questions (covered by CLARIFICATION_REQUESTED) are not notified.
    if (
      e.messageType === 'SYSTEM' ||
      e.messageType === 'CLARIFICATION_QUESTION' ||
      !e.senderUserId
    )
      return;
    const [r] = await this.db
      .select({ reference: requests.reference })
      .from(requests)
      .where(eq(requests.id, e.requestId))
      .limit(1);
    const fromPatient = e.senderUserId === e.patientUserId;
    await this.send({
      userIds: fromPatient
        ? await this.staffOf([e.pharmacyId])
        : [e.patientUserId],
      type:
        fromPatient && e.messageType === 'CLARIFICATION_ANSWER'
          ? 'CLARIFICATION_ANSWERED'
          : 'NEW_MESSAGE',
      params: { reference: r?.reference ?? '' },
      data: {
        request_id: e.requestId,
        conversation_id: e.conversationId,
        message_id: e.messageId,
      },
    });
  }
}
