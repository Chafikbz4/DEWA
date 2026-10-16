import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto';
import {
  recipientStatusEnum,
  requestStatusEnum,
  requestUrgencyEnum,
} from '../../../database/schema';

const csv = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : value;

export class InboxQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Comma-separated recipient statuses',
    example: 'SENT,VIEWED',
  })
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn(recipientStatusEnum.enumValues, { each: true })
  recipient_status?: (typeof recipientStatusEnum.enumValues)[number][];

  @ApiPropertyOptional({ description: 'Comma-separated request statuses' })
  @IsOptional()
  @Transform(csv)
  @IsArray()
  @IsIn(requestStatusEnum.enumValues, { each: true })
  request_status?: (typeof requestStatusEnum.enumValues)[number][];

  @ApiPropertyOptional({ enum: requestUrgencyEnum.enumValues })
  @IsOptional()
  @IsEnum(requestUrgencyEnum.enumValues)
  urgency?: 'NORMAL' | 'URGENT';

  @ApiPropertyOptional({ description: 'Received at or after (ISO)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Received before (ISO)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: ['sent_at', 'expires_at'],
    default: 'sent_at',
    description: 'URGENT requests always come first',
  })
  @IsOptional()
  @IsIn(['sent_at', 'expires_at'])
  sort?: 'sent_at' | 'expires_at';
}

export class DeclineDto {
  @ApiProperty({
    example: 'Médicament en rupture',
    minLength: 3,
    maxLength: 500,
  })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class ClarificationDto {
  @ApiProperty({
    example: 'Le dosage de la ligne 2 est illisible, pouvez-vous préciser ?',
    minLength: 3,
    maxLength: 1000,
  })
  @IsString()
  @Length(3, 1000)
  question!: string;
}
