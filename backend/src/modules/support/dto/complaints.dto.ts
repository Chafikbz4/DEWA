import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto';
import {
  complaintAgainstTypeEnum,
  complaintStatusEnum,
} from '../../../database/schema';

export const COMPLAINT_CATEGORIES = [
  'ORDER_NOT_RECEIVED',
  'WRONG_ITEMS',
  'DAMAGED_PACKAGE',
  'DELAY',
  'BEHAVIOUR',
  'PRICING',
  'PRIVACY',
  'PAYMENT',
  'OTHER',
] as const;

export class CreateComplaintDto {
  @ApiProperty({
    enum: complaintAgainstTypeEnum.enumValues,
    example: 'PHARMACY',
  })
  @IsEnum(complaintAgainstTypeEnum.enumValues)
  against_type!: (typeof complaintAgainstTypeEnum.enumValues)[number];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Pharmacy / driver / user id. Not used for PLATFORM.',
  })
  @IsOptional()
  @IsUUID()
  against_id?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Related order (you must be its patient or driver).',
  })
  @IsOptional()
  @IsUUID()
  order_id?: string;

  @ApiProperty({ enum: COMPLAINT_CATEGORIES })
  @IsIn(COMPLAINT_CATEGORIES)
  category!: (typeof COMPLAINT_CATEGORIES)[number];

  @ApiProperty({
    minLength: 10,
    maxLength: 4000,
    example: 'La commande est arrivée incomplète.',
  })
  @IsString()
  @Length(10, 4000)
  description!: string;
}

export class ComplaintMessageDto {
  @ApiProperty({ minLength: 1, maxLength: 4000 })
  @IsString()
  @Length(1, 4000)
  body!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Attachment uploaded with purpose MESSAGE_ATTACHMENT',
  })
  @IsOptional()
  @IsUUID()
  file_id?: string;
}

export class ComplaintsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Comma-separated statuses' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @IsIn(complaintStatusEnum.enumValues, { each: true })
  status?: (typeof complaintStatusEnum.enumValues)[number][];
}
