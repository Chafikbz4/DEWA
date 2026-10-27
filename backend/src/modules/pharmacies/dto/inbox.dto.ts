import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto';
import {
  recipientStatusEnum,
  requestFulfillmentStatusEnum,
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

export class AcceptInterestDto {
  @ApiProperty({
    example: 185000,
    description:
      'Amount the patient must pay for this request, in centimes of DZD',
    minimum: 1,
    maximum: 100_000_000,
  })
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  amount_centimes!: number;
}

export class UpdateFulfillmentDto {
  @ApiProperty({
    enum: requestFulfillmentStatusEnum.enumValues,
    description:
      'PREPARING / READY are optional progress markers; HANDED_TO_DELIVERY hands a delivery request to its company; DELIVERED closes a delivery; PICKED_UP closes a pickup.',
  })
  @IsEnum(requestFulfillmentStatusEnum.enumValues)
  status!:
    'PREPARING' | 'READY' | 'HANDED_TO_DELIVERY' | 'DELIVERED' | 'PICKED_UP';
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
