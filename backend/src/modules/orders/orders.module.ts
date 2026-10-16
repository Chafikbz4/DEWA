import { Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  DomainEvent,
  OrderStatusChangedEvent,
} from '../../common/events/domain-events';
import { IdempotencyService } from '../../common/http/idempotency.service';
import { NotificationsListener } from '../notifications/notifications.listener';
import { NotificationsService } from '../notifications/notifications.service';
import { RequestsModule } from '../requests/requests.module';
import { OrderStateMachineService } from './order-state-machine.service';
import {
  PatientOrdersController,
  PharmacyOrdersController,
} from './orders.controller';
import { OrdersService } from './orders.service';

@Injectable()
class OrdersJobs {
  private readonly logger = new Logger('OrdersJobs');
  constructor(
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run() {
    if (!this.config.get<boolean>('JOBS_ENABLED', true)) return;
    const [unpaid, validation, unassigned] = [
      await this.orders.cancelUnpaid(),
      await this.orders.expireValidation(),
      await this.orders.alertUnassignedDeliveries(),
    ];
    if (unpaid + validation + unassigned)
      this.logger.log(
        `timeouts: unpaid=${unpaid} validation=${validation} unassigned=${unassigned}`,
      );
  }
}

/** Order notifications: status only, never item names. */
@Injectable()
class OrderNotifications {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly listener: NotificationsListener,
  ) {}

  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED, { async: true })
  async onStatus(e: OrderStatusChangedEvent) {
    const data = { order_id: e.orderId };
    if (e.from === null) {
      await this.notifications.notify({
        userIds: await this.listener.staffOf([e.pharmacyId]),
        type: 'OFFER_ACCEPTED',
        params: { reference: e.reference },
        data,
      });
      return;
    }
    const patientFacing = [
      'AWAITING_PAYMENT',
      'PAYMENT_CONFIRMED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'DELIVERY_ASSIGNED',
      'PICKED_UP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'COMPLETED',
      'CANCELLED',
      'REFUND_PENDING',
      'REFUNDED',
      'FAILED',
    ];
    if (patientFacing.includes(e.to) && e.actorUserId !== e.patientUserId) {
      await this.notifications.notify({
        userIds: [e.patientUserId],
        type: 'ORDER_STATUS_CHANGED',
        params: { reference: e.reference, status: e.to },
        data,
      });
    }
    const pharmacyFacing = [
      'PHARMACIST_VALIDATION_PENDING',
      'PAYMENT_CONFIRMED',
      'CANCELLED',
      'REFUND_PENDING',
      'DELIVERY_ASSIGNED',
      'DELIVERED',
      'FAILED',
    ];
    if (pharmacyFacing.includes(e.to)) {
      await this.notifications.notify({
        userIds: await this.listener.staffOf([e.pharmacyId]),
        type: 'PHARMACY_ORDER_UPDATE',
        params: { reference: e.reference, status: e.to },
        data,
      });
    }
  }

  @OnEvent('order.collection_code', { async: true })
  async onCollectionCode(e: {
    orderId: string;
    patientUserId: string;
    reference: string;
    code: string;
  }) {
    await this.notifications.notify({
      userIds: [e.patientUserId],
      type: 'COLLECTION_CODE',
      params: { reference: e.reference },
      secretParams: { code: e.code },
      data: { order_id: e.orderId },
    });
  }
}

@Module({
  imports: [RequestsModule],
  controllers: [PatientOrdersController, PharmacyOrdersController],
  providers: [
    OrdersService,
    OrderStateMachineService,
    IdempotencyService,
    OrdersJobs,
    OrderNotifications,
  ],
  exports: [OrdersService, OrderStateMachineService, IdempotencyService],
})
export class OrdersModule {}
