import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { AuthUser, PharmacyContext } from '../../common/auth/auth-user';
import {
  CurrentUser,
  Public,
  ReqMeta,
  RequestMeta,
  Roles,
} from '../../common/auth/decorators';
import {
  CurrentPharmacy,
  MyPharmacy,
} from '../../common/auth/pharmacy-access.guard';
import { AppException } from '../../common/errors/app.exception';
import { PaginationQueryDto } from '../../common/http/pagination.dto';
import { ApiErrors } from '../../common/swagger/api-responses';
import { PaymentsService } from './payments.service';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import {
  IPaymentProvider,
  PAYMENT_PROVIDER,
} from './providers/payment-provider';
import { ReceiptsService } from './receipts.service';
import { RefundsService } from './refunds.service';
import { SettlementsService } from './settlements.service';

class RefundRequestDto {
  @ApiPropertyOptional({
    description:
      'Partial amount in centimes; default = everything still refundable',
    example: 15000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount_centimes?: number;

  @ApiProperty({
    minLength: 3,
    maxLength: 500,
    example: 'Article indisponible après paiement',
  })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

class ReasonDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

class ResolveDto {
  @ApiProperty({ minLength: 3, maxLength: 1000 })
  @IsString()
  @Length(3, 1000)
  note!: string;
}

class MarkPaidDto {
  @ApiProperty({ example: 'VIR-2026-10-0042' })
  @IsString()
  @Length(3, 128)
  payout_reference!: string;
}

class GenerateSettlementsDto {
  @ApiProperty({ example: '2026-10-05' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  period_start!: string;
  @ApiProperty({ example: '2026-10-12', description: 'Exclusive end date' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  period_end!: string;
}

class IssuesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'RESOLVED'] })
  @IsOptional()
  @IsIn(['OPEN', 'RESOLVED'])
  status?: string;
  @ApiPropertyOptional({
    enum: [
      'AMOUNT_MISMATCH',
      'DUPLICATE_PAYMENT',
      'STALE_PENDING',
      'MISSING_PAYMENT',
      'ORPHAN_EVENT',
      'PAID_ORDER_NOT_PAYABLE',
    ],
  })
  @IsOptional()
  @IsString()
  kind?: string;
}

class RefundQueueDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Comma-separated refund statuses',
    example: 'REQUESTED,APPROVED',
  })
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
  @IsIn(['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED'], {
    each: true,
  })
  status?: string[];
}

class SettlementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['DRAFT', 'APPROVED', 'PAID'] })
  @IsOptional()
  @IsIn(['DRAFT', 'APPROVED', 'PAID'])
  status?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  pharmacy_id?: string;
}

class SimulateDto {
  @ApiProperty({ enum: ['PAID', 'FAILED', 'CANCELLED'] })
  @IsIn(['PAID', 'FAILED', 'CANCELLED'])
  result!: 'PAID' | 'FAILED' | 'CANCELLED';
  @ApiPropertyOptional({
    description: 'Captured amount (to simulate a mismatch)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  captured_centimes?: number;
  @ApiPropertyOptional({
    default: true,
    description: 'Also send the signed webhook',
  })
  @IsOptional()
  send_webhook?: boolean;
}

const PT = [
  'ROLE_FORBIDDEN',
  'ACCOUNT_PENDING_VERIFICATION',
  'AUTH_TOKEN_MISSING',
] as const;

@ApiTags('Payments (patient)')
@ApiBearerAuth()
@Roles('PATIENT')
@Controller()
export class PatientPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly receipts: ReceiptsService,
    private readonly refunds: RefundsService,
  ) {}

  @Get('orders/:id/checkout')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Checkout summary',
    description:
      'Lines, medicines subtotal, delivery fee, permitted service fee, total, deadline, provider, collection model.',
  })
  @ApiErrors('ORDER_NOT_FOUND', ...PT)
  checkout(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payments.checkout(user, id);
  }

  @Post('orders/:id/pay')
  @HttpCode(HttpStatus.CREATED)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      '8–128 chars; REQUIRED. A double click with the same key returns the same payment.',
  })
  @ApiOperation({
    summary: 'Start paying (redirect to the hosted payment page)',
    description:
      'Order must be AWAITING_PAYMENT before its deadline. Creates a payment (amount from the server-side order), moves the order to PAYMENT_PENDING and ' +
      'returns `redirect_url`. The app opens it, then polls GET /payments/:id/status – a browser "success" never confirms a payment.',
  })
  @ApiErrors(
    'IDEMPOTENCY_KEY_INVALID',
    'IDEMPOTENCY_KEY_REUSED',
    'IDEMPOTENCY_IN_PROGRESS',
    'PAYMENT_NOT_ALLOWED',
    'PAYMENT_DEADLINE_PASSED',
    'PAYMENT_ALREADY_IN_PROGRESS',
    'PAYMENT_NOT_ALLOWED_FOR_CATEGORY',
    'PAYMENT_PROVIDER_ERROR',
    'ORDER_NOT_FOUND',
    ...PT,
  )
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.payments.pay(user, id, key, meta);
  }

  @Get('orders/:id/payments')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Payments of my order' })
  @ApiErrors('ORDER_NOT_FOUND', ...PT)
  orderPayments(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payments.listForOrder(user, id);
  }

  @Get('payments/:id/status')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Payment status (poll after the redirect)',
    description:
      'Each call re-checks a PENDING payment with the provider server-side.',
  })
  @ApiErrors('PAYMENT_NOT_FOUND', ...PT)
  status(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payments.statusForPatient(user, id);
  }

  @Get('orders/:id/receipt')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Receipt (JSON, or PDF with ?format=pdf)',
    description: 'Issued automatically when the payment is CONFIRMED.',
  })
  @ApiErrors('RECEIPT_NOT_FOUND', ...PT)
  async receipt(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const snapshot = await this.receipts.getForPatient(user, id);
    if (format !== 'pdf') return snapshot;
    const pdf = await this.receipts.renderPdf(snapshot);
    res.setHeader('Cache-Control', 'no-store, private');
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `inline; filename="${snapshot.receipt_number}.pdf"`,
    });
  }

  @Post('orders/:id/refund-request')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Request a (partial) refund',
    description:
      'Requires a confirmed payment. Admin approval executes it with the provider.',
  })
  @ApiErrors(
    'REFUND_NOT_ALLOWED',
    'REFUND_AMOUNT_INVALID',
    'ORDER_NOT_FOUND',
    ...PT,
  )
  refund(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RefundRequestDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.refunds.requestByPatient(user, id, dto, meta);
  }

  @Get('orders/:id/refunds')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Refunds of my order' })
  @ApiErrors('ORDER_NOT_FOUND', ...PT)
  refunds_(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.refunds.listForOrder(user, id);
  }
}

@ApiTags('Pharmacy – orders')
@ApiBearerAuth()
@Roles('PHARMACY_OWNER', 'PHARMACIST')
@Controller('pharmacy/orders')
export class PharmacyRefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Post(':id/refund-request')
  @ApiParam({ name: 'id', format: 'uuid' })
  @MyPharmacy({ staffRoles: ['OWNER', 'PHARMACIST'] })
  @ApiOperation({
    summary:
      'Request a partial refund (e.g. item unavailable after payment) – OWNER/PHARMACIST',
  })
  @ApiErrors('REFUND_NOT_ALLOWED', 'REFUND_AMOUNT_INVALID', 'ORDER_NOT_FOUND')
  request(
    @CurrentUser() user: AuthUser,
    @CurrentPharmacy() ph: PharmacyContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RefundRequestDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.refunds.requestByPharmacy(user, ph, id, dto, meta);
  }
}

@ApiTags('Payments – provider callbacks')
@Public()
@SkipThrottle({ auth_ip: true, auth_account: true })
@Controller('payments')
export class PaymentCallbacksController {
  constructor(
    private readonly payments: PaymentsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: IPaymentProvider,
    private readonly config: ConfigService,
  ) {}

  @Post('webhook/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'provider', enum: ['mock', 'edahabia'] })
  @ApiOperation({
    summary: 'Provider webhook',
    description:
      'Signature verified (mock: HMAC-SHA256 in x-mock-signature). Every event is stored in payment_events BEFORE processing; duplicate provider_event_id → 200 { duplicate: true }. ' +
      'Processing only triggers a server-side status check – the webhook body itself never confirms a payment.',
  })
  @ApiErrors('PAYMENT_WEBHOOK_INVALID_SIGNATURE', 'PAYMENT_PROVIDER_UNKNOWN')
  webhook(@Param('provider') provider: string, @Req() req: Request) {
    return this.payments.webhook(
      provider,
      req.headers,
      (req as Request & { rawBody?: Buffer }).rawBody,
    );
  }

  @Get('return/:paymentId')
  @ApiParam({ name: 'paymentId', format: 'uuid' })
  @ApiOperation({
    summary: 'Browser return URL from the hosted page',
    description:
      'Triggers a server-side verification and reports the resulting status.',
  })
  return(@Param('paymentId', new ParseUUIDPipe()) id: string) {
    return this.payments.handleReturn(id);
  }

  // ------------------------------------------- mock gateway (dev / test only)

  private mock(): MockPaymentProvider {
    if (
      this.provider.name !== 'MOCK' ||
      this.config.get('NODE_ENV') === 'production'
    )
      throw new AppException('MOCK_PROVIDER_DISABLED');
    return this.provider as MockPaymentProvider;
  }

  @Get('mock/checkout/:providerOrderId')
  @ApiExcludeEndpoint()
  checkoutPage(@Param('providerOrderId') id: string) {
    const p = this.mock().describe(id);
    if (!p) throw new AppException('PAYMENT_NOT_FOUND');
    return {
      ...p,
      how_to:
        'POST /payments/mock/' +
        id +
        '/simulate { "result": "PAID" | "FAILED" | "CANCELLED" }',
    };
  }

  @Post('mock/:providerOrderId/simulate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[DEV/TEST] Simulate the bank result on the mock gateway',
    description: 'Disabled in production and with real providers.',
  })
  @ApiErrors('MOCK_PROVIDER_DISABLED', 'PAYMENT_NOT_FOUND')
  async simulate(
    @Param('providerOrderId') id: string,
    @Body() dto: SimulateDto,
  ) {
    const mock = this.mock();
    if (!mock.simulate(id, dto.result, dto.captured_centimes))
      throw new AppException('PAYMENT_NOT_FOUND');
    if (dto.send_webhook === false) return { simulated: dto.result };
    const body = Buffer.from(
      JSON.stringify({
        event_id: randomUUID(),
        type: `payment.${dto.result.toLowerCase()}`,
        provider_order_id: id,
      }),
    );
    const result = await this.payments.webhook(
      'mock',
      { 'x-mock-signature': mock.sign(body) },
      body,
    );
    return { simulated: dto.result, webhook: result };
  }
}

@ApiTags('Admin – payments')
@ApiBearerAuth()
@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin')
export class AdminPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
    private readonly settlements: SettlementsService,
  ) {}

  @Get('payments/reconciliation')
  @ApiOperation({
    summary:
      'Reconciliation issues (amount mismatch, duplicates, stale, missing, orphan events)',
  })
  @ApiErrors('ROLE_FORBIDDEN', 'PERMISSION_DENIED')
  issues(@Query() q: IssuesQueryDto) {
    return this.payments.listIssues(q);
  }

  @Post('payments/reconciliation/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run reconciliation now' })
  @ApiErrors('ROLE_FORBIDDEN', 'PERMISSION_DENIED')
  run() {
    return this.payments.reconcile();
  }

  @Post('payments/reconciliation/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Resolve an issue (note required, audited)' })
  @ApiErrors(
    'RECONCILIATION_ISSUE_NOT_FOUND',
    'ROLE_FORBIDDEN',
    'PERMISSION_DENIED',
  )
  resolve(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ResolveDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.payments.resolveIssue(admin, id, dto.note, meta);
  }

  @Get('refunds')
  @ApiOperation({
    summary: 'Refund queue',
    description: 'Filter status (comma list).',
  })
  @ApiErrors('ROLE_FORBIDDEN', 'PERMISSION_DENIED')
  refundQueue(@Query() q: RefundQueueDto) {
    return this.refunds.queue(q);
  }

  @Post('refunds/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Approve and execute a refund with the provider' })
  @ApiErrors(
    'REFUND_NOT_ALLOWED',
    'PAYMENT_PROVIDER_ERROR',
    'ROLE_FORBIDDEN',
    'PERMISSION_DENIED',
  )
  approve(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.refunds.approve(admin, id, meta);
  }

  @Post('refunds/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Reject a refund (reason required)' })
  @ApiErrors('REFUND_NOT_ALLOWED', 'ROLE_FORBIDDEN', 'PERMISSION_DENIED')
  reject(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.refunds.reject(admin, id, dto.reason, meta);
  }

  @Get('settlements')
  @ApiOperation({
    summary:
      'Settlement records (records only unless payouts are legally allowed)',
  })
  @ApiErrors('ROLE_FORBIDDEN', 'PERMISSION_DENIED')
  settlementsList(@Query() q: SettlementsQueryDto) {
    return this.settlements.list(q);
  }

  @Post('settlements/generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate settlements for a period (idempotent)' })
  @ApiErrors('ROLE_FORBIDDEN', 'PERMISSION_DENIED')
  generate(@Body() dto: GenerateSettlementsDto) {
    return this.settlements.generate(
      new Date(`${dto.period_start}T00:00:00Z`),
      new Date(`${dto.period_end}T00:00:00Z`),
    );
  }

  @Post('settlements/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Approve a DRAFT settlement' })
  @ApiErrors('SETTLEMENT_INVALID_STATE', 'ROLE_FORBIDDEN', 'PERMISSION_DENIED')
  approveSettlement(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.settlements.approve(admin, id, meta);
  }

  @Post('settlements/:id/mark-paid')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Record an off-platform payout for an APPROVED settlement',
  })
  @ApiErrors('SETTLEMENT_INVALID_STATE', 'ROLE_FORBIDDEN', 'PERMISSION_DENIED')
  markPaid(
    @CurrentUser() admin: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MarkPaidDto,
    @ReqMeta() meta: RequestMeta,
  ) {
    return this.settlements.markPaid(admin, id, dto.payout_reference, meta);
  }
}
