import { Global, Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';

/** Conversation persistence shared by pharmacy (clarifications) and messaging. */
@Global()
@Module({
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class MessagingCoreModule {}
