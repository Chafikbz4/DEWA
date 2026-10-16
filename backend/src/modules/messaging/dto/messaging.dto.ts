import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto';
import { conversationStatusEnum } from '../../../database/schema';

export const SENDABLE_TYPES = [
  'TEXT',
  'IMAGE',
  'CLARIFICATION_QUESTION',
  'CLARIFICATION_ANSWER',
] as const;

export class SendMessageDto {
  @ApiProperty({
    enum: SENDABLE_TYPES,
    description:
      'Patient: TEXT, IMAGE, CLARIFICATION_ANSWER. Pharmacy staff: TEXT, IMAGE, CLARIFICATION_QUESTION. SYSTEM is server-only.',
  })
  @IsIn(SENDABLE_TYPES)
  type!: (typeof SENDABLE_TYPES)[number];

  @ApiPropertyOptional({
    description:
      'Required unless IMAGE. Max length = setting message_max_length (2000).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  body?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Attachment uploaded with purpose MESSAGE_ATTACHMENT (required for IMAGE).',
  })
  @IsOptional()
  @IsUUID()
  file_id?: string;
}

export class ConversationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: conversationStatusEnum.enumValues })
  @IsOptional()
  @IsEnum(conversationStatusEnum.enumValues)
  status?: 'OPEN' | 'CLOSED';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  request_id?: string;
}

export class MessagesQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Cursor: id of the oldest message already loaded (meta.cursor.next_cursor).',
  })
  @IsOptional()
  @IsUUID()
  before?: string;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;
}
