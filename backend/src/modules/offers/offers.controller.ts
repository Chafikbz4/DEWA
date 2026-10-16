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
import { ApiEnvelope, ApiErrors } from '../../common/swagger/api-responses';
import {
  CreateOfferDto,
  ItemApprovalDto,
  OfferDto,
  PharmacyOffersQueryDto,
} from './dto/offers.dto';
import { OffersService } from './offers.service';

const PH = [
  'ROLE_FORBIDDEN',
  'PHARMACY_ACCESS_DENIED',
  'PHARMACY_NOT_VERIFIED',
  'ACCOUNT_PENDING_VERIFICATION',
  'AUTH_TOKEN_MISSING',
] as const;
const PT = [
  'ROLE_FORBIDDEN',
  'ACCOUNT_PENDING_VERIFICATION',
  'AUTH_TOKEN_MISSING',
] as const;

@ApiTags('Pharmacy – offers')
@ApiBearerAuth()
@Roles('PHARMACY_OWNER', 'PHARMACIST', 'PHARMACY_ASSISTANT')
@Controller('pharmacy')
export class PharmacyOffersController {
  constructor(private readonly offers: OffersService) {}

  @Post('requests/:id/offers')
  @ApiParam({ name: 'id', format: 'uuid', description: 'Request id' })
  @MyPharmacy()
  @ApiOperation({
    summary:
      'Create a DRAFT offer (all staff; substitutions OWNER/PHARMACIST only)',
    description:
      'All amounts are computed by the server: line_total = unit × quantity_offered (0 if UNAVAILABLE), subtotal, delivery fee from ' +
      'delivery_fee_rules (never from the client), service fee from settings. Items in restricted categories are refused. One active offer per pharmacy and request.',
  })
  @ApiEnvelope(OfferDto, { status: 201 })
  @ApiErrors(
    'REQUEST_NOT_FOUND',
    'RECIPIENT_CLOSED',
    'OFFER_ALREADY_EXISTS',
    'OFFER_ITEM_INVALID',
    'OFFER_ITEM_RESTRICTED',
    'OFFER_ALTERNATIVE_REQUIRES_PHARMACIST',
    'OFFER_DELIVERY_NOT_AVAILABLE',
    'DELIVERY_ZONE_NOT_COVERED',
    ...PH,
  )
  create(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateOfferDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.offers.create(user, ph, id, dto, meta);
  }

  @Get('offers')
  @MyPharmacy()
  @ApiOperation({
    summary: 'My pharmacy offers',
    description: 'Filter by status (comma list).',
  })
  @ApiErrors(...PH)
  list(
    @CurrentPharmacy() ph: PharmacyContext,
    @Query() q: PharmacyOffersQueryDto,
  ) {
    return this.offers.listForPharmacy(ph, q);
  }

  @Get('offers/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy()
  @ApiOperation({ summary: 'Offer detail' })
  @ApiEnvelope(OfferDto)
  @ApiErrors('OFFER_NOT_FOUND', ...PH)
  get(
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.offers.getForPharmacy(ph, id);
  }

  @Patch('offers/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy()
  @ApiOperation({ summary: 'Replace a DRAFT offer (same body as create)' })
  @ApiEnvelope(OfferDto)
  @ApiErrors(
    'OFFER_NOT_FOUND',
    'OFFER_NOT_EDITABLE',
    'RECIPIENT_CLOSED',
    'OFFER_ITEM_RESTRICTED',
    'OFFER_ALTERNATIVE_REQUIRES_PHARMACIST',
    ...PH,
  )
  update(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateOfferDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.offers.update(user, ph, id, dto, meta);
  }

  @Post('offers/:id/send')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy()
  @ApiOperation({
    summary: 'Send the offer to the patient',
    description:
      'DRAFT → SENT; recipient → OFFERED; request → OFFER_AVAILABLE. Sent by OWNER/PHARMACIST, linked request items are marked confirmed_by_pharmacist.',
  })
  @ApiEnvelope(OfferDto)
  @ApiErrors(
    'OFFER_NOT_FOUND',
    'OFFER_NOT_EDITABLE',
    'OFFER_NOT_SENDABLE',
    'OFFER_EXPIRED',
    'RECIPIENT_CLOSED',
    ...PH,
  )
  send(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.offers.send(user, ph, id, meta);
  }

  @Post('offers/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy()
  @ApiOperation({ summary: 'Withdraw a DRAFT or SENT offer' })
  @ApiEnvelope(OfferDto)
  @ApiErrors('OFFER_NOT_FOUND', 'OFFER_NOT_WITHDRAWABLE', ...PH)
  withdraw(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.offers.withdraw(user, ph, id, meta);
  }
}

@ApiTags('Offers (patient)')
@ApiBearerAuth()
@Roles('PATIENT')
@Controller()
export class PatientOffersController {
  constructor(private readonly offers: OffersService) {}

  @Get('requests/:id/offers')
  @ApiParam({ name: 'id', format: 'uuid', description: 'Request id' })
  @ApiOperation({
    summary:
      'Offers received for my request (cheapest first, drafts never shown)',
  })
  @ApiEnvelope(OfferDto, { isArray: true })
  @ApiErrors('REQUEST_NOT_FOUND', ...PT)
  list(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.offers.listForRequest(user, id);
  }

  @Get('requests/:id/offers/compare')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Compare sent offers',
    description:
      'Normalized totals (incl. effective total after rejected alternatives), missing / partial items, alternatives, preparation time, delivery, distance.',
  })
  @ApiErrors('REQUEST_NOT_FOUND', ...PT)
  compare(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.offers.compare(user, id);
  }

  @Get('offers/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Offer detail (patient)' })
  @ApiEnvelope(OfferDto)
  @ApiErrors('OFFER_NOT_FOUND', ...PT)
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.offers.getForPatient(user, id);
  }

  @Post('offers/:id/items/:itemId/approval')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'itemId', format: 'uuid' })
  @ApiOperation({
    summary: 'Approve or reject a proposed substitution',
    description:
      'Each alternative (patient_approval = PENDING) must be decided before the offer can be accepted (Phase 6). Rejected lines are excluded from the order.',
  })
  @ApiEnvelope(OfferDto)
  @ApiErrors('OFFER_NOT_FOUND', 'OFFER_ITEM_APPROVAL_NOT_PENDING', ...PT)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: ItemApprovalDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.offers.decideAlternative(user, id, itemId, dto.decision, meta);
  }
}
