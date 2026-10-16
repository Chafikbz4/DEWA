import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { and, eq, inArray } from 'drizzle-orm';
import {
  DomainEvent,
  OfferEvent,
  RequestStatusChangedEvent,
} from '../../common/events/domain-events';
import { UnitOfWork } from '../../common/events/unit-of-work';
import { Database, DRIZZLE } from '../../database/database.module';
import { conversations, offerItems, offers } from '../../database/schema';
import { ConversationsService } from './conversations.service';

/**
 * Keeps conversations in sync with the request lifecycle:
 * – a conversation is created when a pharmacy sends an offer (or asks a question),
 * – SYSTEM messages record status changes and substitution proposals (linked to offer_items),
 * – conversations close when the request ends.
 */
@Injectable()
export class ConversationSystemListener {
  private readonly logger = new Logger('ConversationSystem');

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly uow: UnitOfWork,
    private readonly core: ConversationsService,
  ) {}

  @OnEvent(DomainEvent.OFFER_SENT, { async: true })
  async onOfferSent(e: OfferEvent) {
    try {
      const pending = await this.db
        .select({ id: offerItems.id })
        .from(offerItems)
        .where(
          and(
            eq(offerItems.offerId, e.offerId),
            eq(offerItems.patientApproval, 'PENDING'),
          ),
        );
      await this.uow.run(async (ctx) => {
        const conv = await this.core.ensure(
          ctx.tx,
          e.requestId,
          e.pharmacyId,
          e.patientUserId,
        );
        await this.core.systemMessage(ctx, conv, 'system.offer_sent', {
          offer_id: e.offerId,
        });
        if (pending.length) {
          // The patient must approve or reject each listed alternative explicitly.
          await this.core.systemMessage(
            ctx,
            conv,
            'system.offer_alternatives_pending',
            {
              offer_id: e.offerId,
              offer_item_ids: pending.map((p) => p.id),
            },
          );
        }
      });
    } catch (err) {
      this.logger.error(
        `offer system message failed: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent(DomainEvent.REQUEST_STATUS_CHANGED, { async: true })
  async onRequestStatus(e: RequestStatusChangedEvent) {
    if (e.to === 'AWAITING_PHARMACY_RESPONSE' && e.from === 'REQUEST_SUBMITTED')
      return;
    try {
      const convs = await this.db
        .select()
        .from(conversations)
        .where(eq(conversations.requestId, e.requestId));
      if (!convs.length) return;
      await this.uow.run(async (ctx) => {
        for (const c of convs.filter((x) => x.status === 'OPEN')) {
          await this.core.systemMessage(
            ctx,
            c,
            `system.request_status.${e.to}`,
            { from: e.from, to: e.to },
          );
        }
        if (e.to === 'CANCELLED' || e.to === 'EXPIRED') {
          await ctx.tx
            .update(conversations)
            .set({ status: 'CLOSED' })
            .where(eq(conversations.requestId, e.requestId));
        }
        if (e.to === 'OFFER_ACCEPTED') {
          // Only the pharmacy whose offer was accepted keeps chatting.
          const [accepted] = await ctx.tx
            .select({ pharmacyId: offers.pharmacyId })
            .from(offers)
            .where(
              and(
                eq(offers.requestId, e.requestId),
                eq(offers.status, 'ACCEPTED'),
              ),
            )
            .limit(1);
          const toClose = convs
            .filter((c) => c.pharmacyId !== accepted?.pharmacyId)
            .map((c) => c.id);
          if (toClose.length)
            await ctx.tx
              .update(conversations)
              .set({ status: 'CLOSED' })
              .where(inArray(conversations.id, toClose));
        }
      });
    } catch (err) {
      this.logger.error(
        `status system message failed: ${(err as Error).message}`,
      );
    }
  }
}
