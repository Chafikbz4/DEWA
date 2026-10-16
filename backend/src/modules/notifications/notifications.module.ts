import { Global, Module } from '@nestjs/common';
import {
  MockPushProvider,
  PUSH_PROVIDER,
} from '../messaging-providers/providers';
import { NotificationsController } from './notifications.controller';
import { NotificationsListener } from './notifications.listener';
import { NotificationsService } from './notifications.service';
import { NotificationTemplatesService } from './notification-templates.service';

/** Global: later modules (orders, payments, delivery, admin) send notifications too. */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationTemplatesService,
    NotificationsListener,
    // Replace with an FCM/APNs implementation in production.
    { provide: PUSH_PROVIDER, useClass: MockPushProvider },
  ],
  exports: [
    NotificationsService,
    NotificationsListener,
    NotificationTemplatesService,
    PUSH_PROVIDER,
  ],
})
export class NotificationsModule {}
