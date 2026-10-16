import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import {
  CurrentUser,
  ReqMeta,
  RequestMeta,
  Roles,
} from '../../common/auth/decorators';
import { ApiErrors } from '../../common/swagger/api-responses';
import {
  ConversationsQueryDto,
  MessagesQueryDto,
  SendMessageDto,
} from './dto/messaging.dto';
import { MessagingService } from './messaging.service';

@ApiTags('Messaging')
@ApiBearerAuth()
@Roles('PATIENT', 'PHARMACY_OWNER', 'PHARMACIST', 'PHARMACY_ASSISTANT')
@Controller('conversations')
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get()
  @ApiOperation({
    summary: 'My conversations',
    description:
      'Patient: own conversations. Pharmacy staff: conversations of their pharmacy. Sorted by last message. Filter status, request_id.',
  })
  @ApiErrors('ROLE_FORBIDDEN', 'AUTH_TOKEN_MISSING')
  list(@CurrentUser() user: AuthUser, @Query() q: ConversationsQueryDto) {
    return this.messaging.list(user, q);
  }

  @Get(':id/messages')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Messages (cursor pagination, newest first)',
    description:
      'Pass meta.cursor.next_cursor as `before` to load older messages; null = no more.',
  })
  @ApiErrors('CONVERSATION_NOT_FOUND')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: MessagesQueryDto,
  ) {
    return this.messaging.messages(user, id, q);
  }

  @Post(':id/messages')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Send a message',
    description:
      'CLARIFICATION_ANSWER (patient) brings the request back from CLARIFICATION_REQUIRED (to OFFER_AVAILABLE if an offer is pending, else AWAITING_PHARMACY_RESPONSE). ' +
      'Safety: max length, per-user rate limit, phone numbers and blocked words rejected (configurable), attachments must be MESSAGE_ATTACHMENT files you uploaded.',
  })
  @ApiErrors(
    'CONVERSATION_NOT_FOUND',
    'CONVERSATION_CLOSED',
    'MESSAGE_TYPE_NOT_ALLOWED',
    'MESSAGE_EMPTY',
    'MESSAGE_TOO_LONG',
    'MESSAGE_RATE_LIMITED',
    'MESSAGE_CONTAINS_PHONE',
    'MESSAGE_BLOCKED_CONTENT',
    'FILE_INVALID_FOR_USE',
  )
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SendMessageDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.messaging.send(user, id, dto, meta);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Mark the other side’s messages as read' })
  @ApiErrors('CONVERSATION_NOT_FOUND')
  read(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.messaging.markRead(user, id);
  }
}
