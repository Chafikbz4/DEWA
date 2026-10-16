/**
 * Domain events emitted with @nestjs/event-emitter. Listeners: notifications,
 * realtime gateway, audit. Payloads never contain medicine names or medical data.
 */
export const DomainEvent = {
  REQUEST_CREATED: 'request.created',
  REQUEST_STATUS_CHANGED: 'request.status_changed',
  OFFER_SENT: 'offer.new',
  OFFER_WITHDRAWN: 'offer.withdrawn',
  MESSAGE_CREATED: 'message.new',
  ORDER_STATUS_CHANGED: 'order.status_changed',
  PAYMENT_CONFIRMED: 'payment.confirmed',
  PAYMENT_FAILED: 'payment.failed',
  REFUND_COMPLETED: 'refund.completed',
  DELIVERY_STATUS_CHANGED: 'delivery.status_changed',
  DELIVERY_CODE_ISSUED: 'delivery.code_issued',
  ACCOUNT_STATUS_CHANGED: 'account.status_changed',
  VERIFICATION_DECIDED: 'verification.decided',
  COMPLAINT_UPDATED: 'complaint.updated',
  ADMIN_ALERT: 'admin.alert',
} as const;

export interface RequestStatusChangedEvent {
  requestId: string;
  reference: string;
  patientUserId: string;
  from: string | null;
  to: string;
  pharmacyIds: string[];
}

export interface OfferEvent {
  offerId: string;
  requestId: string;
  reference: string;
  patientUserId: string;
  pharmacyId: string;
}

export interface MessageCreatedEvent {
  messageId: string;
  conversationId: string;
  requestId: string;
  pharmacyId: string;
  patientUserId: string;
  senderUserId: string | null;
  messageType: string;
}

export interface OrderStatusChangedEvent {
  orderId: string;
  reference: string;
  patientUserId: string;
  pharmacyId: string;
  from: string | null;
  to: string;
  actorUserId: string | null;
}

export interface DeliveryStatusChangedEvent {
  deliveryId: string;
  orderId: string;
  patientUserId: string;
  pharmacyId: string;
  driverUserId: string | null;
  from: string | null;
  to: string;
}

export interface AdminAlertEvent {
  kind: string;
  resourceType: string;
  resourceId: string;
  message: string;
}
