import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
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
import {
  AcceptOfferDto,
  CancelOrderDto,
  HandoverDto,
  OrdersQueryDto,
  ValidateOrderDto,
} from './dto/orders.dto';
import { OrdersService } from './orders.service';

const PT = [
  'ROLE_FORBIDDEN',
  'ACCOUNT_PENDING_VERIFICATION',
  'AUTH_TOKEN_MISSING',
] as const;
const PH = [
  'ROLE_FORBIDDEN',
  'PHARMACY_ACCESS_DENIED',
  'PHARMACY_NOT_VERIFIED',
  'ACCOUNT_PENDING_VERIFICATION',
  'AUTH_TOKEN_MISSING',
] as const;
const SM = [
  'ORDER_NOT_FOUND',
  'ORDER_INVALID_TRANSITION',
  'ORDER_ACTION_FORBIDDEN',
  'ORDER_VERSION_CONFLICT',
] as const;

@ApiTags('Orders (patient)')
@ApiBearerAuth()
@Roles('PATIENT')
@Controller()
export class PatientOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('offers/:id/accept')
  @ApiParam({ name: 'id', format: 'uuid', description: 'Offer id' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      '8–128 chars. Retries with the same key replay the first response.',
  })
  @ApiOperation({
    summary: 'Accept an offer → creates the order',
    description:
      'Offer must be SENT and unexpired, every substitution decided, items still allowed and in stock. Prices are frozen. Other offers are REJECTED, ' +
      'the request becomes OFFER_ACCEPTED. Initial status: PHARMACIST_VALIDATION_PENDING (validation first, default) or AWAITING_PAYMENT (payment first).',
  })
  @ApiErrors(
    'OFFER_NOT_FOUND',
    'OFFER_EXPIRED',
    'ORDER_OFFER_NOT_AVAILABLE',
    'ORDER_ALTERNATIVES_PENDING',
    'ORDER_NOTHING_TO_ORDER',
    'ORDER_ITEM_OUT_OF_STOCK',
    'ORDER_DELIVERY_NOT_AVAILABLE',
    'REQUEST_CATEGORY_RESTRICTED',
    'IDEMPOTENCY_KEY_INVALID',
    'IDEMPOTENCY_KEY_REUSED',
    'IDEMPOTENCY_IN_PROGRESS',
    ...PT,
  )
  accept(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AcceptOfferDto,
    @Headers('idempotency-key') key: string | undefined,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.orders.accept(user, id, dto, key, meta);
  }

  @Get('orders')
  @ApiOperation({
    summary: 'My orders',
    description:
      'Filter status (comma list), from/to; sort created_at | updated_at.',
  })
  @ApiErrors(...PT)
  list(@CurrentUser() user: AuthUser, @Query() q: OrdersQueryDto) {
    return this.orders.listForPatient(user, q);
  }

  @Get('orders/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Order detail (full patient view, incl. next_actions)',
  })
  @ApiErrors('ORDER_NOT_FOUND', ...PT)
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.orders.getForPatient(user, id);
  }

  @Get('orders/:id/timeline')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Order timeline with localized labels' })
  @ApiErrors('ORDER_NOT_FOUND', ...PT)
  timeline(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.orders.timeline(user, id);
  }

  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Cancel my order',
    description:
      'Free before payment capture (→ CANCELLED). After capture and before preparation → REFUND_PENDING. During preparation / ready / assigned → ' +
      'ORDER_CANCEL_REQUIRES_APPROVAL (ask the pharmacy or support). Never after the courier picked it up.',
  })
  @ApiErrors(
    'ORDER_NOT_CANCELLABLE',
    'ORDER_CANCEL_REQUIRES_APPROVAL',
    ...SM,
    ...PT,
  )
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.cancelByPatient(user, id, dto.reason);
  }

  @Post('orders/:id/collection-code')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Get a new collection code (pickup orders, READY_FOR_PICKUP)',
    description:
      'Returned once; only its hash is stored. Resets wrong attempts.',
  })
  @ApiErrors('ORDER_INVALID_TRANSITION', 'ORDER_NOT_FOUND', ...PT)
  collectionCode(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.orders.regenerateCollectionCode(user, id);
  }
}

@ApiTags('Pharmacy – orders')
@ApiBearerAuth()
@Roles('PHARMACY_OWNER', 'PHARMACIST', 'PHARMACY_ASSISTANT')
@Controller('pharmacy/orders')
export class PharmacyOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @MyPharmacy()
  @ApiOperation({ summary: 'Orders of my pharmacy (all staff)' })
  @ApiErrors(...PH)
  list(@CurrentPharmacy() ph: PharmacyContext, @Query() q: OrdersQueryDto) {
    return this.orders.listForPharmacy(ph, q);
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy()
  @ApiOperation({
    summary:
      'Order detail (pharmacy view: patient first name, delivery area only)',
  })
  @ApiErrors('ORDER_NOT_FOUND', ...PH)
  get(
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.orders.getForPharmacy(ph, id);
  }

  @Get(':id/timeline')
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy()
  @ApiOperation({ summary: 'Order timeline' })
  @ApiErrors('ORDER_NOT_FOUND', ...PH)
  timeline(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.orders.timeline(user, id, ph);
  }

  @Post(':id/validate')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy({ staffRoles: ['OWNER', 'PHARMACIST'] })
  @ApiOperation({
    summary: 'Pharmacist validation (OWNER/PHARMACIST only)',
    description:
      'Explicit decision with `confirm: true` and a note. APPROVE: validation-first → AWAITING_PAYMENT (payment deadline starts); payment-first → PREPARING. ' +
      'REJECT: validation-first → CANCELLED; payment-first → REFUND_PENDING.',
  })
  @ApiErrors('ORDER_VALIDATION_CONFIRM_REQUIRED', ...SM, ...PH)
  validate(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ValidateOrderDto,
  ) {
    return this.orders.validate(user, ph, id, dto);
  }

  @Post(':id/start-preparing')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy()
  @ApiOperation({ summary: 'PAYMENT_CONFIRMED → PREPARING (validation-first)' })
  @ApiErrors(...SM, ...PH)
  start(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.orders.startPreparing(user, ph, id);
  }

  @Post(':id/ready')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy()
  @ApiOperation({
    summary: 'PREPARING → READY_FOR_PICKUP',
    description:
      'Pickup: the patient receives a collection code. Delivery: a delivery job is created (pickup code for the pharmacy, delivery code for the patient).',
  })
  @ApiErrors(...SM, ...PH)
  ready(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.orders.markReady(user, ph, id);
  }

  @Post(':id/handover')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy()
  @ApiOperation({
    summary:
      'Pickup hand-over: READY_FOR_PICKUP → COMPLETED with the patient collection code (5 attempts)',
  })
  @ApiErrors(
    'ORDER_COLLECTION_CODE_INVALID',
    'ORDER_COLLECTION_CODE_LOCKED',
    ...SM,
    ...PH,
  )
  handover(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: HandoverDto,
  ) {
    return this.orders.handover(user, ph, id, dto.collection_code);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy({ staffRoles: ['OWNER', 'PHARMACIST'] })
  @ApiOperation({
    summary:
      'Cancel an order (OWNER/PHARMACIST) – refund flow when already paid',
  })
  @ApiErrors('ORDER_NOT_CANCELLABLE', 'ORDER_REASON_REQUIRED', ...SM, ...PH)
  cancel(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.cancelByPharmacy(user, ph, id, dto.reason);
  }
}
