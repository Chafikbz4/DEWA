import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { PHARMACY_ROLES } from '../../common/auth/auth-user';
import { Database, DRIZZLE } from '../../database/database.module';
import { conversations, messages, pharmacyStaff } from '../../database/schema';
import { FileAccessService } from '../files/file-access.service';
import { RequestsModule } from '../requests/requests.module';
import { ConversationSystemListener } from './conversation-system.listener';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

@Module({
  imports: [RequestsModule],
  controllers: [MessagingController],
  providers: [MessagingService, ConversationSystemListener],
  exports: [MessagingService],
})
export class MessagingModule implements OnModuleInit {
  constructor(
    private readonly fileAccess: FileAccessService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  /** Chat attachments: readable by both participants of the conversation. */
  onModuleInit() {
    this.fileAccess.registerRule(async (user, file) => {
      if (file.purpose !== 'MESSAGE_ATTACHMENT') return null;
      const [m] = await this.db
        .select({
          patientUserId: conversations.patientUserId,
          pharmacyId: conversations.pharmacyId,
        })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .where(eq(messages.fileId, file.id))
        .limit(1);
      if (!m) return null;
      if (m.patientUserId === user.id)
        return { via: 'conversation-participant' };
      if (!PHARMACY_ROLES.includes(user.role)) return null;
      const [staff] = await this.db
        .select({ id: pharmacyStaff.id })
        .from(pharmacyStaff)
        .where(
          and(
            eq(pharmacyStaff.userId, user.id),
            eq(pharmacyStaff.pharmacyId, m.pharmacyId),
            eq(pharmacyStaff.isActive, true),
          ),
        )
        .limit(1);
      return staff ? { via: 'conversation-participant' } : null;
    });
  }
}
