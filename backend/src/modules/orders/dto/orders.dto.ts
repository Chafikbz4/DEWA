import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/http/pagination.dto';
import { fulfillmentTypeEnum, orderStatusEnum } from '../../../database/schema';

export class AcceptOfferDto {
  @ApiProperty({
    enum: fulfillmentTypeEnum.enumValues,
    description: 'DELIVERY only if the offer has delivery_available.',
  })
  @IsEnum(fulfillmentTypeEnum.enumValues)
  fulfillment_type!: 'DELIVERY' | 'PICKUP';
}

export class OrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Comma-separated order statuses' })
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
  @IsIn(orderStatusEnum.enumValues, { each: true })
  status?: (typeof orderStatusEnum.enumValues)[number][];

  @ApiPropertyOptional({ description: 'Created at or after (ISO)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Created before (ISO)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: ['created_at', 'updated_at'],
    default: 'created_at',
  })
  @IsOptional()
  @IsIn(['created_at', 'updated_at'])
  sort?: 'created_at' | 'updated_at';
}

export class CancelOrderDto {
  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    example: 'Je n’en ai plus besoin',
  })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class ValidateOrderDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @ApiProperty({
    description:
      'Must be true: the pharmacist explicitly confirms having checked the order against the prescription.',
    example: true,
  })
  @Equals(true)
  confirm!: boolean;

  @ApiProperty({
    minLength: 3,
    maxLength: 1000,
    example: 'Ordonnance conforme, posologie vérifiée.',
  })
  @IsString()
  @Length(3, 1000)
  note!: string;
}

export class HandoverDto {
  @ApiProperty({
    description: 'Collection code shown by the patient',
    example: '482913',
  })
  @Matches(/^\d{6}$/)
  collection_code!: string;
}
