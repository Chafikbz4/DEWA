import { Inject, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { and, eq } from 'drizzle-orm';
import { Namespace, Socket } from 'socket.io';
import { AccessTokenVerifier } from '../../common/auth/access-token.verifier';
import { PHARMACY_ROLES } from '../../common/auth/auth-user';
import { AppException } from '../../common/errors/app.exception';
import {
  DeliveryStatusChangedEvent,
  DomainEvent,
  MessageCreatedEvent,
  OfferEvent,
  OrderStatusChangedEvent,
  RequestStatusChangedEvent,
} from '../../common/events/domain-events';
import { Database, DRIZZLE } from '../../database/database.module';
import { pharmacyStaff } from '../../database/schema';
import { SESSIONS_REVOKED_EVENT } from '../auth/services/token.service';
import { NOTIFICATION_CREATED_EVENT } from '../notifications/notifications.service';

const userRoom = (id: string) => `user:${id}`;
const pharmacyRoom = (id: string) => `pharmacy:${id}`;

/**
 * Socket.IO gateway (namespace /realtime). Authenticated with the same access
 * token as REST: `io(url + '/realtime', { auth: { token } })`. Events carry ids
 * and statuses only – REST stays the source of truth.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, ok?: boolean) => void,
    ) =>
      cb(
        null,
        !origin ||
          (process.env.CORS_ORIGINS ?? '')
            .split(',')
            .map((o) => o.trim())
            .includes(origin),
      ),
  },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger('Realtime');
  /** Namespaced gateway → the injected server is the /realtime Namespace. */
  @WebSocketServer() server!: Namespace;

  constructor(
    private readonly verifier: AccessTokenVerifier,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async handleConnection(client: Socket) {
    const raw =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers.authorization ?? '').replace(/^Bearer /, '');
    try {
      if (!raw) throw new AppException('AUTH_TOKEN_MISSING');
      const user = await this.verifier.verify(raw);
      if (user.status === 'SUSPENDED' || user.status === 'DELETED')
        throw new AppException('ACCOUNT_SUSPENDED');
      client.data.userId = user.id;
      client.data.sessionId = user.sessionId;
      await client.join(userRoom(user.id));
      if (PHARMACY_ROLES.includes(user.role)) {
        const [staff] = await this.db
          .select({ pharmacyId: pharmacyStaff.pharmacyId })
          .from(pharmacyStaff)
          .where(
            and(
              eq(pharmacyStaff.userId, user.id),
              eq(pharmacyStaff.isActive, true),
            ),
          )
          .limit(1);
        if (staff) await client.join(pharmacyRoom(staff.pharmacyId));
      }
      client.emit('connected', { user_id: user.id });
    } catch (err) {
      const code =
        err instanceof AppException ? err.code : 'AUTH_TOKEN_INVALID';
      client.emit('error', { code });
      client.disconnect(true);
    }
  }

  private emit(
    rooms: string[],
    event: string,
    payload: Record<string, unknown>,
  ) {
    if (!this.server || !rooms.length) return;
    this.server
      .to(rooms)
      .emit(event, { ...payload, emitted_at: new Date().toISOString() });
  }

  @OnEvent(SESSIONS_REVOKED_EVENT)
  onSessionsRevoked(e: { sessionIds: string[] }) {
    if (!this.server) return;
    const revoked = new Set(e.sessionIds);
    for (const socket of this.server.sockets.values()) {
      if (revoked.has(socket.data.sessionId as string)) socket.disconnect(true);
    }
  }

  @OnEvent(DomainEvent.MESSAGE_CREATED)
  onMessage(e: MessageCreatedEvent) {
    this.emit(
      [userRoom(e.patientUserId), pharmacyRoom(e.pharmacyId)],
      'message.new',
      {
        conversation_id: e.conversationId,
        message_id: e.messageId,
        request_id: e.requestId,
        message_type: e.messageType,
        sender_user_id: e.senderUserId,
      },
    );
  }

  @OnEvent(DomainEvent.OFFER_SENT)
  onOffer(e: OfferEvent) {
    this.emit([userRoom(e.patientUserId)], 'offer.new', {
      offer_id: e.offerId,
      request_id: e.requestId,
      pharmacy_id: e.pharmacyId,
    });
  }

  @OnEvent(DomainEvent.REQUEST_STATUS_CHANGED)
  onRequest(e: RequestStatusChangedEvent) {
    this.emit(
      [userRoom(e.patientUserId), ...e.pharmacyIds.map(pharmacyRoom)],
      'request.status_changed',
      {
        request_id: e.requestId,
        reference: e.reference,
        from: e.from,
        to: e.to,
      },
    );
  }

  @OnEvent(DomainEvent.ORDER_STATUS_CHANGED)
  onOrder(e: OrderStatusChangedEvent) {
    this.emit(
      [userRoom(e.patientUserId), pharmacyRoom(e.pharmacyId)],
      'order.status_changed',
      {
        order_id: e.orderId,
        reference: e.reference,
        from: e.from,
        to: e.to,
      },
    );
  }

  @OnEvent(DomainEvent.DELIVERY_STATUS_CHANGED)
  onDelivery(e: DeliveryStatusChangedEvent) {
    const rooms = [userRoom(e.patientUserId), pharmacyRoom(e.pharmacyId)];
    if (e.driverUserId) rooms.push(userRoom(e.driverUserId));
    this.emit(rooms, 'delivery.status_changed', {
      delivery_id: e.deliveryId,
      order_id: e.orderId,
      from: e.from,
      to: e.to,
    });
  }

  @OnEvent(NOTIFICATION_CREATED_EVENT)
  onNotification(e: { userId: string; notificationId: string; type: string }) {
    this.emit([userRoom(e.userId)], 'notification.new', {
      notification_id: e.notificationId,
      type: e.type,
    });
  }

  /** Used by the delivery module to stream driver positions to the patient. */
  emitToUser(userId: string, event: string, payload: Record<string, unknown>) {
    this.emit([userRoom(userId)], event, payload);
  }
}
