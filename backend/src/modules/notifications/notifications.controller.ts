import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import type { AuthUser } from '../../common/auth/auth-user';
import { AllowAccountStatus, CurrentUser } from '../../common/auth/decorators';
import { PaginationQueryDto } from '../../common/http/pagination.dto';
import { ApiEnvelope, ApiErrors } from '../../common/swagger/api-responses';
import { NotificationsService } from './notifications.service';

class NotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: Boolean, description: 'Only unread' })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional({ example: 'OFFER_RECEIVED' })
  @IsOptional()
  @IsString()
  @Length(2, 64)
  type?: string;
}

class PreferencesDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() push_enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sms_enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() email_enabled?: boolean;
  @ApiPropertyOptional({
    type: [String],
    description:
      'Notification types to mute (in-app still recorded). Security types cannot be muted.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  muted_types?: string[];
}

class NotificationDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'OFFER_RECEIVED' }) type!: string;
  @ApiProperty({
    example: 'Nouvelle proposition',
    description: 'Rendered in your preferred language',
  })
  title!: string;
  @ApiProperty({
    example:
      'Vous avez reçu une proposition pour votre demande RX-2026-000123.',
  })
  body!: string;
  @ApiProperty({ example: 'notifications.OFFER_RECEIVED.title' })
  title_key!: string;
  @ApiProperty({ example: 'notifications.OFFER_RECEIVED.body' })
  body_key!: string;
  @ApiProperty({
    example: { request_id: '…', offer_id: '…' },
    description: 'Ids for deep links',
  })
  data!: Record<string, string>;
  @ApiPropertyOptional({ nullable: true }) read_at!: Date | null;
  @ApiProperty() created_at!: Date;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@AllowAccountStatus('PENDING_VERIFICATION')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'My in-app notifications',
    description: '`meta.unread_count` gives the badge count.',
  })
  @ApiEnvelope(NotificationDto, { paginated: true })
  @ApiErrors('AUTH_TOKEN_MISSING')
  list(@CurrentUser() user: AuthUser, @Query() q: NotificationsQueryDto) {
    return this.notifications.list(user, q);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all as read' })
  @ApiErrors('AUTH_TOKEN_MISSING')
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Mark one as read' })
  @ApiErrors('NOTIFICATION_NOT_FOUND')
  read(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.notifications.markRead(user, id);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Channel preferences and muted types' })
  @ApiErrors('AUTH_TOKEN_MISSING')
  preferences(@CurrentUser() user: AuthUser) {
    return this.notifications.getPreferences(user);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update channel preferences / muted types' })
  @ApiErrors('AUTH_TOKEN_MISSING')
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: PreferencesDto,
  ) {
    return this.notifications.updatePreferences(user, dto);
  }
}
