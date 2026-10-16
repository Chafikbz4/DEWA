import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DomainEvent } from '../../common/events/domain-events';
import { OrdersModule } from '../orders/orders.module';
import { RequestsModule } from '../requests/requests.module';
import {
  AdminPaymentsController,
  PatientPaymentsController,
  PaymentCallbacksController,
  PharmacyRefundsController,
} from './payments.controller';
import { PaymentsService } from './payments.service';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { PAYMENT_PROVIDER } from './providers/payment-provider';
import { SatimEdahabiaProvider } from './providers/satim-edahabia.provider';
import { ReceiptsService } from './receipts.service';
import { RefundsService } from './refunds.service';
import { SettlementsService } from './settlements.service';

@Injectable()
class PaymentsJobs {
  private readonly logger = new Logger('PaymentsJobs');
  constructor(
    private readonly payments: PaymentsService,
    private readonly settlements: SettlementsService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reconcile() {
    if (!this.config.get<boolean>('JOBS_ENABLED', true)) return;
    const r = await this.payments.reconcile();
    if (r.checked || r.duplicates || r.missing)
      this.logger.log(`reconciliation ${JSON.stringify(r)}`);
  }

  @Cron('0 30 2 * * *')
  async settle() {
    if (!this.config.get<boolean>('JOBS_ENABLED', true)) return;
    const { start, end } = await this.settlements.previousPeriod();
    const r = await this.settlements.generate(start, end);
    if (r.created) this.logger.log(`settlements generated: ${r.created}`);
  }
}

@Injectable()
class PaymentNotifications {
  constructor(
    private readonly payments: PaymentsService,
    private readonly refunds: RefundsService,
  ) {}

  @OnEvent(DomainEvent.PAYMENT_CONFIRMED, { async: true })
  confirmed(e: { orderId: string }) {
    return this.payments.notifyPatient('PAYMENT_CONFIRMED', e.orderId);
  }

  @OnEvent(DomainEvent.PAYMENT_FAILED, { async: true })
  failed(e: { orderId: string }) {
    return this.payments.notifyPatient('PAYMENT_FAILED', e.orderId);
  }

  @OnEvent(DomainEvent.REFUND_COMPLETED, { async: true })
  refunded(e: { orderId: string; patientUserId: string; reference: string }) {
    return this.refunds.notifyCompleted(e);
  }
}

@Module({
  imports: [OrdersModule, RequestsModule],
  controllers: [
    PatientPaymentsController,
    PharmacyRefundsController,
    PaymentCallbacksController,
    AdminPaymentsController,
  ],
  providers: [
    PaymentsService,
    ReceiptsService,
    RefundsService,
    SettlementsService,
    PaymentsJobs,
    PaymentNotifications,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (c: ConfigService) =>
        c.get('PAYMENT_PROVIDER') === 'satim'
          ? new SatimEdahabiaProvider()
          : new MockPaymentProvider(c),
    },
  ],
  exports: [
    PaymentsService,
    RefundsService,
    SettlementsService,
    PAYMENT_PROVIDER,
  ],
})
export class PaymentsModule {}
