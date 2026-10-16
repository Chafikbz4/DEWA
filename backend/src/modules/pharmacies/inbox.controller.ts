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
import type { AuthUser, PharmacyContext } from '../../common/auth/auth-user';
import {
  CurrentUser,
  ReqMeta,
  RequestMeta,
  Roles,
} from '../../common/auth/decorators';
import {
  CurrentPharmacy,
  MyPharmacy,
} from '../../common/auth/pharmacy-access.guard';
import { ApiErrors } from '../../common/swagger/api-responses';
import { ClarificationDto, DeclineDto, InboxQueryDto } from './dto/inbox.dto';
import { InboxService } from './inbox.service';

const COMMON = [
  'ROLE_FORBIDDEN',
  'PHARMACY_ACCESS_DENIED',
  'PHARMACY_NOT_VERIFIED',
  'ACCOUNT_PENDING_VERIFICATION',
  'AUTH_TOKEN_MISSING',
] as const;

@ApiTags('Pharmacy – request inbox')
@ApiBearerAuth()
@Roles('PHARMACY_OWNER', 'PHARMACIST', 'PHARMACY_ASSISTANT')
@Controller('pharmacy/requests')
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get()
  @MyPharmacy()
  @ApiOperation({
    summary: 'Requests received by my pharmacy (all staff)',
    description:
      'Filter recipient_status, request_status, urgency, from/to (received). URGENT first, then sort sent_at | expires_at.',
  })
  @ApiErrors(...COMMON)
  list(@CurrentPharmacy() ph: PharmacyContext, @Query() q: InboxQueryDto) {
    return this.inbox.list(ph, q);
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid', description: 'Request id' })
  @MyPharmacy()
  @ApiOperation({
    summary: 'Request detail (all staff)',
    description:
      'Patient first name only, items, file ids, delivery area. Prescription files are viewable through /files/:id/access-url ' +
      'ONLY by OWNER/PHARMACIST with the patient consent active (can_view_prescription). Marks the request VIEWED and writes a sensitive_access_log.',
  })
  @ApiErrors('REQUEST_NOT_FOUND', ...COMMON)
  detail(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.inbox.detail(user, ph, id, meta);
  }

  @Post(':id/accept-interest')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy()
  @ApiOperation({
    summary: 'Signal interest (all staff)',
    description:
      'Recipient → INTERESTED. Does NOT authorize dispensing, does NOT create an order or an offer.',
  })
  @ApiErrors('REQUEST_NOT_FOUND', 'RECIPIENT_CLOSED', ...COMMON)
  interest(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.inbox.acceptInterest(user, ph, id, meta);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy({ staffRoles: ['OWNER', 'PHARMACIST'] })
  @ApiOperation({
    summary: 'Decline the request (OWNER, PHARMACIST)',
    description: 'Withdraw a sent offer first. Draft offers are discarded.',
  })
  @ApiErrors('REQUEST_NOT_FOUND', 'RECIPIENT_CLOSED', ...COMMON)
  decline(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DeclineDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.inbox.decline(user, ph, id, dto.reason, meta);
  }

  @Post(':id/clarification')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy({ staffRoles: ['OWNER', 'PHARMACIST'] })
  @ApiOperation({
    summary: 'Ask the patient a question (OWNER, PHARMACIST)',
    description:
      'Creates the conversation if needed, posts a CLARIFICATION_QUESTION message, request → CLARIFICATION_REQUIRED.',
  })
  @ApiErrors(
    'REQUEST_NOT_FOUND',
    'RECIPIENT_CLOSED',
    'CLARIFICATION_NOT_ALLOWED',
    ...COMMON,
  )
  clarification(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ClarificationDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.inbox.clarification(user, ph, id, dto.question, meta);
  }
}
