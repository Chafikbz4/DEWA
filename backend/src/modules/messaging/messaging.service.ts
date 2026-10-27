import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
import { AuthUser, PHARMACY_ROLES } from '../../common/auth/auth-user';
import { RequestMeta } from '../../common/auth/decorators';
import { AppException } from '../../common/errors/app.exception';
import { UnitOfWork } from '../../common/events/unit-of-work';
import { CursorPage, Paginated } from '../../common/http/envelope';
import { Database, DRIZZLE } from '../../database/database.module';
import {
  conversations,
  messages,
  offers,
  patientProfiles,
  pharmacies,
  pharmacyStaff,
  requestRecipients,
  requests,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { FilesService } from '../files/files.service';
import { RequestLifecycleService } from '../requests/request-lifecycle.service';
import { SettingsService } from '../settings/settings.service';
import { ConversationsService } from './conversations.service';
import {
  ConversationsQueryDto,
  MessagesQueryDto,
  SendMessageDto,
} from './dto/messaging.dto';

type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

/** Sequences of ≥ 9 digits (with optional spaces, dots, dashes, parentheses, leading +). */
const PHONE_PATTERN = /(?:\+?\d[\s().-]*){9,}/;

export interface ConversationAccess {
  conversation: ConversationRow;
  side: 'PATIENT' | 'PHARMACY';
}

@Injectable()
export class MessagingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly uow: UnitOfWork,
    private readonly conversationsCore: ConversationsService,
    private readonly lifecycle: RequestLifecycleService,
    private readonly files: FilesService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Pharmacy of an active staff member, or null. */
  private async staffPharmacy(userId: string) {
    const [row] = await this.db
      .select({ pharmacyId: pharmacyStaff.pharmacyId })
      .from(pharmacyStaff)
      .where(
        and(eq(pharmacyStaff.userId, userId), eq(pharmacyStaff.isActive, true)),
      )
      .limit(1);
    return row?.pharmacyId ?? null;
  }

  /**
   * Only the patient and the active staff of that pharmacy. Everyone else –
   * including admins without a justified grant (Phase 9) – gets 404.
   */
  async access(
    user: AuthUser,
    conversationId: string,
  ): Promise<ConversationAccess> {
    const [c] = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (c && user.role === 'PATIENT' && c.patientUserId === user.id)
      return { conversation: c, side: 'PATIENT' };
    if (
      c &&
      PHARMACY_ROLES.includes(user.role) &&
      (await this.staffPharmacy(user.id)) === c.pharmacyId
    ) {
      return { conversation: c, side: 'PHARMACY' };
    }
    throw new AppException('CONVERSATION_NOT_FOUND');
  }

  // -------------------------------------------------------------- listing

  async list(user: AuthUser, q: ConversationsQueryDto) {
    let scope: SQL;
    if (user.role === 'PATIENT')
      scope = eq(conversations.patientUserId, user.id);
    else {
      const pharmacyId = await this.staffPharmacy(user.id);
      if (!pharmacyId) return Paginated.of([], 0, q.page, q.limit);
      scope = eq(conversations.pharmacyId, pharmacyId);
    }
    const conditions: SQL[] = [scope];
    if (q.status) conditions.push(eq(conversations.status, q.status));
    if (q.request_id)
      conditions.push(eq(conversations.requestId, q.request_id));
    const where = and(...conditions);
    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          c: conversations,
          reference: requests.reference,
          pharmacyNameFr: pharmacies.nameFr,
          pharmacyNameAr: pharmacies.nameAr,
          patientFirstName: patientProfiles.firstName,
          unread: sql<number>`(SELECT count(*)::int FROM ${messages} m WHERE m.conversation_id = ${conversations.id} AND m.read_at IS NULL AND (m.sender_user_id IS DISTINCT FROM ${user.id}) AND m.message_type <> 'SYSTEM')`,
        })
        .from(conversations)
        .innerJoin(requests, eq(requests.id, conversations.requestId))
        .innerJoin(pharmacies, eq(pharmacies.id, conversations.pharmacyId))
        .leftJoin(
          patientProfiles,
          eq(patientProfiles.userId, conversations.patientUserId),
        )
        .where(where)
        .orderBy(
          sql`${conversations.lastMessageAt} DESC NULLS LAST`,
          desc(conversations.createdAt),
        )
        .limit(q.limit)
        .offset(q.offset),
      this.db.select({ total: count() }).from(conversations).where(where),
    ]);
    const ids = rows.map((r) => r.c.id);
    const last = ids.length
      ? await this.db.execute<MessageRow & { conversation_id: string }>(
          sql`SELECT DISTINCT ON (conversation_id) * FROM ${messages} WHERE conversation_id IN (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `,
          )}) ORDER BY conversation_id, created_at DESC`,
        )
      : { rows: [] };
    const lastByConv = new Map(
      last.rows.map((m) => [
        m.conversation_id,
        m as unknown as Record<string, unknown>,
      ]),
    );
    return Paginated.of(
      rows.map((r) => {
        const m = lastByConv.get(r.c.id);
        return {
          id: r.c.id,
          request_id: r.c.requestId,
          request_reference: r.reference,
          pharmacy: {
            id: r.c.pharmacyId,
            name_fr: r.pharmacyNameFr,
            name_ar: r.pharmacyNameAr,
          },
          patient_first_name: r.patientFirstName,
          status: r.c.status,
          unread_count: Number(r.unread),
          last_message: m
            ? {
                id: m.id as string,
                message_type: m.message_type as string,
                body_preview:
                  typeof m.body === 'string' ? m.body.slice(0, 120) : null,
                created_at: m.created_at as Date,
              }
            : null,
          last_message_at: r.c.lastMessageAt,
          created_at: r.c.createdAt,
        };
      }),
      total,
      q.page,
      q.limit,
    );
  }

  presentMessage(m: MessageRow, viewer: AuthUser, c: ConversationRow) {
    return {
      id: m.id,
      conversation_id: m.conversationId,
      sender_user_id: m.senderUserId,
      sender_side:
        m.senderUserId === null
          ? 'SYSTEM'
          : m.senderUserId === c.patientUserId
            ? 'PATIENT'
            : 'PHARMACY',
      is_mine: m.senderUserId === viewer.id,
      message_type: m.messageType,
      body: m.body,
      file_id: m.fileId,
      metadata: m.metadata ?? null,
      read_at: m.readAt,
      created_at: m.createdAt,
    };
  }

  /** Newest first. `before` = id of the oldest message already loaded. */
  async messages(user: AuthUser, conversationId: string, q: MessagesQueryDto) {
    const { conversation } = await this.access(user, conversationId);
    const conditions: SQL[] = [eq(messages.conversationId, conversation.id)];
    if (q.before) {
      const [pivot] = await this.db
        .select({ createdAt: messages.createdAt, id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.id, q.before),
            eq(messages.conversationId, conversation.id),
          ),
        )
        .limit(1);
      if (!pivot)
        throw new AppException('VALIDATION_FAILED', [
          {
            field: 'before',
            errors: [{ rule: 'isUUID', message_key: 'validation.isUUID' }],
          },
        ]);
      conditions.push(
        or(
          lt(messages.createdAt, pivot.createdAt),
          and(
            eq(messages.createdAt, pivot.createdAt),
            lt(messages.id, pivot.id),
          ),
        ) as SQL,
      );
    }
    const rows = await this.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const next = rows.length > q.limit ? page[page.length - 1].id : null;
    return new CursorPage(
      page.map((m) => this.presentMessage(m, user, conversation)),
      next,
      q.limit,
    );
  }

  // -------------------------------------------------------------- sending

  private async assertSafe(user: AuthUser, body: string | undefined) {
    const max = await this.settings.get('message_max_length');
    if (body && body.length > max)
      throw new AppException('MESSAGE_TOO_LONG', null, { max });
    const limit = await this.settings.get('message_rate_limit_per_minute');
    const [{ n }] = await this.db
      .select({ n: count() })
      .from(messages)
      .where(
        and(
          eq(messages.senderUserId, user.id),
          gte(messages.createdAt, new Date(Date.now() - 60_000)),
        ),
      );
    if (n >= limit) throw new AppException('MESSAGE_RATE_LIMITED');
    if (!body) return;
    if (
      (await this.settings.get('message_block_phone_numbers')) &&
      PHONE_PATTERN.test(body)
    ) {
      throw new AppException('MESSAGE_CONTAINS_PHONE');
    }
    const blocked = (
      (await this.settings.get('message_blocked_words')) as string[]
    )
      .map((w) => w.toLowerCase())
      .filter(Boolean);
    const lower = body.toLowerCase();
    if (blocked.some((w) => lower.includes(w)))
      throw new AppException('MESSAGE_BLOCKED_CONTENT');
  }

  async send(
    user: AuthUser,
    conversationId: string,
    dto: SendMessageDto,
    meta: RequestMeta,
  ) {
    const { conversation, side } = await this.access(user, conversationId);
    if (conversation.status !== 'OPEN')
      throw new AppException('CONVERSATION_CLOSED');

    const allowed =
      side === 'PATIENT'
        ? ['TEXT', 'IMAGE', 'CLARIFICATION_ANSWER']
        : ['TEXT', 'IMAGE', 'CLARIFICATION_QUESTION'];
    if (!allowed.includes(dto.type))
      throw new AppException('MESSAGE_TYPE_NOT_ALLOWED');
    const body = dto.body?.trim() || undefined;
    if (dto.type === 'IMAGE' && !dto.file_id)
      throw new AppException('MESSAGE_EMPTY');
    if (dto.type !== 'IMAGE' && !body) throw new AppException('MESSAGE_EMPTY');
    await this.assertSafe(user, body);
    if (dto.file_id)
      await this.files.assertUsable(
        user.id,
        [dto.file_id],
        ['MESSAGE_ATTACHMENT'],
      );

    const message = await this.uow.run(async (ctx) => {
      const m = await this.conversationsCore.post(ctx, conversation, {
        senderUserId: user.id,
        type: dto.type,
        body: body ?? null,
        fileId: dto.file_id ?? null,
      });

      const [r] = await ctx.tx
        .select()
        .from(requests)
        .where(eq(requests.id, conversation.requestId))
        .limit(1);
      if (dto.type === 'CLARIFICATION_ANSWER') {
        // The patient answered: this pharmacy can act again; the request leaves CLARIFICATION_REQUIRED.
        await ctx.tx
          .update(requestRecipients)
          .set({ status: 'VIEWED' })
          .where(
            and(
              eq(requestRecipients.requestId, conversation.requestId),
              eq(requestRecipients.pharmacyId, conversation.pharmacyId),
              eq(requestRecipients.status, 'CLARIFICATION_ASKED'),
            ),
          );
        if (r?.status === 'CLARIFICATION_REQUIRED') {
          const [{ sent }] = await ctx.tx
            .select({ sent: count() })
            .from(offers)
            .where(and(eq(offers.requestId, r.id), eq(offers.status, 'SENT')));
          await this.lifecycle.transition(
            ctx,
            r,
            sent > 0 ? 'OFFER_AVAILABLE' : 'AWAITING_PHARMACY_RESPONSE',
            {
              userId: user.id,
              role: user.role,
            },
          );
        }
      }
      if (
        dto.type === 'CLARIFICATION_QUESTION' &&
        r &&
        ['AWAITING_PHARMACY_RESPONSE', 'OFFER_AVAILABLE'].includes(r.status)
      ) {
        await ctx.tx
          .update(requestRecipients)
          .set({ status: 'CLARIFICATION_ASKED' })
          .where(
            and(
              eq(requestRecipients.requestId, r.id),
              eq(requestRecipients.pharmacyId, conversation.pharmacyId),
              inArray(requestRecipients.status, ['SENT', 'VIEWED', 'ACCEPTED']),
            ),
          );
        await this.lifecycle.transition(ctx, r, 'CLARIFICATION_REQUIRED', {
          userId: user.id,
          role: user.role,
        });
      }
      return m;
    });
    await this.audit.log({
      action: 'MESSAGE_SENT',
      actorUserId: user.id,
      actorRole: user.role,
      resourceType: 'conversation',
      resourceId: conversation.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
      // Never the content.
      metadata: {
        message_id: message.id,
        type: dto.type,
        attachment: !!dto.file_id,
      },
    });
    return this.presentMessage(message, user, conversation);
  }

  /** Marks the other side's messages as read. */
  async markRead(user: AuthUser, conversationId: string) {
    const { conversation, side } = await this.access(user, conversationId);
    const otherSide =
      side === 'PATIENT'
        ? ne(messages.senderUserId, conversation.patientUserId)
        : eq(messages.senderUserId, conversation.patientUserId);
    const res = await this.db
      .update(messages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(messages.conversationId, conversation.id),
          isNull(messages.readAt),
          otherSide,
        ),
      )
      .returning({ id: messages.id });
    return { conversation_id: conversation.id, marked_read: res.length };
  }
}
