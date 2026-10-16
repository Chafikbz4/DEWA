import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  DomainEvent,
  MessageCreatedEvent,
} from '../../common/events/domain-events';
import { TxContext } from '../../common/events/unit-of-work';
import { Database, DbOrTx, DRIZZLE } from '../../database/database.module';
import { conversations, messages } from '../../database/schema';

export type MessageType = (typeof messages.$inferSelect)['messageType'];

/** Low-level conversation/message persistence shared by pharmacy & messaging modules. */
@Injectable()
export class ConversationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** One conversation per (request, pharmacy); created on first use. */
  async ensure(
    tx: DbOrTx,
    requestId: string,
    pharmacyId: string,
    patientUserId: string,
  ) {
    await tx
      .insert(conversations)
      .values({ requestId, pharmacyId, patientUserId, status: 'OPEN' })
      .onConflictDoNothing({
        target: [conversations.requestId, conversations.pharmacyId],
      });
    const [c] = await tx
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.requestId, requestId),
          eq(conversations.pharmacyId, pharmacyId),
        ),
      )
      .limit(1);
    return c;
  }

  async post(
    ctx: TxContext,
    conversation: typeof conversations.$inferSelect,
    input: {
      senderUserId: string | null;
      type: MessageType;
      body: string | null;
      fileId?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ) {
    const [m] = await ctx.tx
      .insert(messages)
      .values({
        conversationId: conversation.id,
        senderUserId: input.senderUserId,
        messageType: input.type,
        body: input.body,
        fileId: input.fileId ?? null,
        metadata: input.metadata ?? null,
      })
      .returning();
    await ctx.tx
      .update(conversations)
      .set({ lastMessageAt: m.createdAt })
      .where(eq(conversations.id, conversation.id));
    const event: MessageCreatedEvent = {
      messageId: m.id,
      conversationId: conversation.id,
      requestId: conversation.requestId,
      pharmacyId: conversation.pharmacyId,
      patientUserId: conversation.patientUserId,
      senderUserId: input.senderUserId,
      messageType: input.type,
    };
    ctx.emit(DomainEvent.MESSAGE_CREATED, event);
    return m;
  }

  /** System message (status changes…) – no sender. */
  systemMessage(
    ctx: TxContext,
    conversation: typeof conversations.$inferSelect,
    key: string,
    metadata: Record<string, unknown> = {},
  ) {
    // body = i18n key under `system.*`; clients translate it.
    return this.post(ctx, conversation, {
      senderUserId: null,
      type: 'SYSTEM',
      body: key,
      metadata: { key, ...metadata },
    });
  }
}
