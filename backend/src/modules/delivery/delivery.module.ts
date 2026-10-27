import { Inject, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { and, eq } from 'drizzle-orm';
import { PHARMACY_ROLES } from '../../common/auth/auth-user';
import { DomainEvent } from '../../common/events/domain-events';
import { Database, DRIZZLE } from '../../database/database.module';
import { deliveries, orders, pharmacyStaff } from '../../database/schema';
import { AuthModule } from '../auth/auth.module';
import { FileAccessService } from '../files/file-access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersModule } from '../orders/orders.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { DeliveryCompanyService } from './delivery-company.service';
import { DriverPrivacyInterceptor } from './delivery-privacy';
import {
  DeliveryCompanyController,
  DeliveryRegisterController,
  DriverController,
  PatientDeliveryCompaniesController,
  PatientDeliveryController,
  PharmacyDeliveryController,
} from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DriverJobsService } from './driver-jobs.service';

/** Codes and job alerts. Push / SMS bodies carry references only – never medicine names. */
@Injectable()
class DeliveryNotifications {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly delivery: DeliveryService,
  ) {}

  @OnEvent(DomainEvent.DELIVERY_CODE_ISSUED, { async: true })
  async codes(e: {
    orderId: string;
    reference: string;
    pharmacyId: string;
    patientUserId: string;
    pickupCode: string;
    deliveryCode: string;
  }) {
    await this.notifications.notify({
      userIds: await this.delivery.staffUserIds(e.pharmacyId),
      type: 'PICKUP_CODE',
      params: { reference: e.reference },
      secretParams: { code: e.pickupCode },
      data: { order_id: e.orderId },
    });
    await this.notifications.notify({
      userIds: [e.patientUserId],
      type: 'DELIVERY_CODE',
      params: { reference: e.reference },
      secretParams: { code: e.deliveryCode },
      data: { order_id: e.orderId },
    });
  }

  @OnEvent('delivery.job_available', { async: true })
  async jobAvailable(e: {
    deliveryId: string;
    latitude: number | null;
    longitude: number | null;
  }) {
    const userIds = await this.delivery.driversToAlert(e.latitude, e.longitude);
    if (userIds.length)
      await this.notifications.notify({
        userIds,
        type: 'DELIVERY_JOB_AVAILABLE',
        data: { delivery_id: e.deliveryId },
      });
  }
}

@Module({
  imports: [OrdersModule, AuthModule, RealtimeModule],
  controllers: [
    DeliveryRegisterController,
    DriverController,
    DeliveryCompanyController,
    PatientDeliveryCompaniesController,
    PatientDeliveryController,
    PharmacyDeliveryController,
  ],
  providers: [
    DeliveryService,
    DriverJobsService,
    DeliveryCompanyService,
    DeliveryNotifications,
    DriverPrivacyInterceptor,
  ],
  exports: [DeliveryService],
})
export class DeliveryModule implements OnModuleInit {
  constructor(
    private readonly fileAccess: FileAccessService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  /** Proof-of-delivery files: the patient of the order and the pharmacy staff may read them. */
  onModuleInit() {
    this.fileAccess.registerRule(async (user, file) => {
      if (file.purpose !== 'PROOF_OF_DELIVERY') return null;
      const [row] = await this.db
        .select({
          patient: orders.patientUserId,
          pharmacyId: orders.pharmacyId,
        })
        .from(deliveries)
        .innerJoin(orders, eq(orders.id, deliveries.orderId))
        .where(eq(deliveries.proofFileId, file.id))
        .limit(1);
      if (!row) return null;
      if (user.role === 'PATIENT' && row.patient === user.id)
        return { via: 'delivery-recipient' };
      if (!PHARMACY_ROLES.includes(user.role)) return null;
      const [staff] = await this.db
        .select({ id: pharmacyStaff.id })
        .from(pharmacyStaff)
        .where(
          and(
            eq(pharmacyStaff.pharmacyId, row.pharmacyId),
            eq(pharmacyStaff.userId, user.id),
            eq(pharmacyStaff.isActive, true),
          ),
        )
        .limit(1);
      return staff ? { via: 'delivery-pharmacy' } : null;
    });
  }
}
