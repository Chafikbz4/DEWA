import {
  Body,
  Controller,
  Delete,
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
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth/auth-user';
import {
  CurrentUser,
  ReqMeta,
  RequestMeta,
  Roles,
} from '../../common/auth/decorators';
import { ApiEnvelope, ApiErrors } from '../../common/swagger/api-responses';
import {
  CancelRequestDto,
  CreateRequestDto,
  MatchingPreviewDto,
  MatchingPreviewResponseDto,
  RequestDetailDto,
  RequestItemInputDto,
  RequestsQueryDto,
  RequestSummaryDto,
  UpdateRequestItemDto,
} from './dto/requests.dto';
import { RequestsService } from './requests.service';

const AUTH = [
  'ROLE_FORBIDDEN',
  'ACCOUNT_PENDING_VERIFICATION',
  'AUTH_TOKEN_MISSING',
  'AUTH_SESSION_REVOKED',
] as const;

@ApiTags('Requests (patient)')
@ApiBearerAuth()
@Roles('PATIENT')
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post('preview-matching')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview which pharmacies would receive the request',
    description:
      'Call before the final submit so the patient sees the pharmacies. Same rules as POST /requests.',
  })
  @ApiEnvelope(MatchingPreviewResponseDto)
  @ApiErrors(
    'ADDRESS_NOT_FOUND',
    'REQUEST_PHARMACY_NOT_ELIGIBLE',
    'REQUEST_TOO_MANY_PHARMACIES',
    ...AUTH,
  )
  preview(@CurrentUser() user: AuthUser, @Body() dto: MatchingPreviewDto) {
    return this.requests.previewMatching(user, dto);
  }

  @Post()
  @ApiOperation({
    summary: 'Submit a request (PRESCRIPTION, CHIFA or PRODUCT)',
    description:
      'Creates the request (reference RX-YYYY-NNNNNN), the share-consent record and one recipient per matched pharmacy, then ' +
      'moves it to AWAITING_PHARMACY_RESPONSE. Rejects restricted medicine categories (REQUEST_CATEGORY_RESTRICTED). ' +
      'CHIFA data is stored but coverage is NOT verified unless an official CNAS integration exists. OCR (if enabled) adds ' +
      'advisory items later (source=OCR).',
  })
  @ApiEnvelope(RequestDetailDto, { status: 201 })
  @ApiErrors(
    'REQUEST_CONSENT_REQUIRED',
    'ADDRESS_NOT_FOUND',
    'DEPENDANT_NOT_FOUND',
    'DEPENDANT_RELATIONSHIP_NOT_ALLOWED',
    'DEPENDANT_NOT_VERIFIED',
    'FILE_INVALID_FOR_USE',
    'CHIFA_DATA_REQUIRED',
    'REQUEST_CATEGORY_RESTRICTED',
    'REQUEST_DELIVERY_NOT_ALLOWED',
    'REQUEST_NO_PHARMACY_MATCHED',
    'REQUEST_PHARMACY_NOT_ELIGIBLE',
    'REQUEST_TOO_MANY_PHARMACIES',
    ...AUTH,
  )
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRequestDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.requests.create(user, dto, meta);
  }

  @Get()
  @ApiOperation({
    summary: 'My requests',
    description:
      'Filter by status (comma list), request_type, from/to. Sort created_at | expires_at.',
  })
  @ApiEnvelope(RequestSummaryDto, { paginated: true })
  @ApiErrors(...AUTH)
  list(@CurrentUser() user: AuthUser, @Query() q: RequestsQueryDto) {
    return this.requests.list(user, q);
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Request detail',
    description:
      "Includes recipients' statuses, items (incl. OCR suggestions) and a summary of sent offers.",
  })
  @ApiEnvelope(RequestDetailDto)
  @ApiErrors('REQUEST_NOT_FOUND', ...AUTH)
  detail(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.requests.detail(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Cancel a request',
    description:
      'Allowed while open (no order yet). If an order exists, cancel the order instead (REQUEST_HAS_ORDER).',
  })
  @ApiEnvelope(RequestDetailDto)
  @ApiErrors(
    'REQUEST_NOT_FOUND',
    'REQUEST_NOT_CANCELLABLE',
    'REQUEST_HAS_ORDER',
    ...AUTH,
  )
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelRequestDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.requests.cancel(user, id, dto.reason, meta);
  }

  @Post(':id/items')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Add an item',
    description:
      'Only while REQUEST_SUBMITTED / AWAITING_PHARMACY_RESPONSE / CLARIFICATION_REQUIRED.',
  })
  @ApiEnvelope(RequestDetailDto, { status: 201 })
  @ApiErrors(
    'REQUEST_NOT_FOUND',
    'REQUEST_NOT_EDITABLE',
    'REQUEST_CATEGORY_RESTRICTED',
    ...AUTH,
  )
  addItem(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RequestItemInputDto,
  ) {
    return this.requests.addItem(user, id, dto);
  }

  @Patch(':id/items/:itemId')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiOperation({
    summary: 'Edit an item (e.g. correct an OCR suggestion)',
    description:
      'Edited OCR items become source=PATIENT. Pharmacist-confirmed items are locked.',
  })
  @ApiEnvelope(RequestDetailDto)
  @ApiErrors(
    'REQUEST_NOT_FOUND',
    'REQUEST_NOT_EDITABLE',
    'REQUEST_ITEM_NOT_FOUND',
    'REQUEST_ITEM_LOCKED',
    'REQUEST_CATEGORY_RESTRICTED',
    ...AUTH,
  )
  updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateRequestItemDto,
  ) {
    return this.requests.updateItem(user, id, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiOperation({ summary: 'Remove an item' })
  @ApiEnvelope(RequestDetailDto)
  @ApiErrors(
    'REQUEST_NOT_FOUND',
    'REQUEST_NOT_EDITABLE',
    'REQUEST_ITEM_NOT_FOUND',
    'REQUEST_ITEM_LOCKED',
    ...AUTH,
  )
  deleteItem(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ) {
    return this.requests.deleteItem(user, id, itemId);
  }
}
