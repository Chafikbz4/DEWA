# Realtime events catalogue

Socket.IO, namespace **`/realtime`**.

```ts
import { io } from 'socket.io-client';
const socket = io(`${BASE_URL}/realtime`, { auth: { token: accessToken }, transports: ['websocket'] });
socket.on('connected', ({ user_id }) => {/* joined your rooms */});
socket.on('error', ({ code }) => {/* AUTH_TOKEN_EXPIRED → refresh then reconnect; AUTH_SESSION_REVOKED / ACCOUNT_SUSPENDED → log out */});
```

How the connection behaves:
- **Rooms are chosen by the server.** You join your user room and, for pharmacy staff, your pharmacy room. Clients cannot subscribe to anything else.
- **The token is checked at connection time.** An invalid or expired token at (re)connect gets `error { code }` and a disconnect. Always reconnect with the current access token (refresh first if needed); set `socket.auth.token` before reconnecting.
- **When the session is revoked** (logout-all, suspension), the socket is disconnected.
- **Events are signals, not data.** Payloads hold ids and statuses only. After each event, refetch the resource with REST. When the app returns to the foreground, refetch the visible screen too (events missed while disconnected are not replayed).

| Event | Received by | Payload | Then call |
|---|---|---|---|
| `connected` | the socket | `{ user_id }` | — |
| `message.new` | patient + pharmacy staff of the conversation | `{ conversation_id, message_id, request_id, message_type, sender_user_id }` | `GET /conversations/:id/messages` |
| `offer.new` | patient | `{ offer_id, request_id, pharmacy_id }` | `GET /offers/:id` |
| `request.status_changed` | patient + recipient pharmacies | `{ request_id, reference, from, to }` | `GET /requests/:id` · `GET /pharmacy/requests/:id` |
| `order.status_changed` | patient + pharmacy | `{ order_id, reference, from, to }` | `GET /orders/:id` · `GET /pharmacy/orders/:id` |
| `delivery.status_changed` | patient + pharmacy + assigned driver | `{ delivery_id, order_id, from, to }` | `GET /orders/:id/delivery` · `GET /pharmacy/orders/:id/delivery` · `GET /delivery/jobs/:id` |
| `delivery.location` | patient, only while OUT_FOR_DELIVERY | `{ order_id, latitude, longitude, updated_at }` | — (move the map marker) |
| `notification.new` | the user | `{ notification_id, type }` | `GET /notifications` (badge / toast) |
| `error` | the socket | `{ code }` | see above |

Push notification types (FCM / APNs; the payload `data` includes `type`, `notification_id` and the related ids):

`REQUEST_RECEIVED`, `CLARIFICATION_REQUESTED`, `CLARIFICATION_ANSWERED`, `OFFER_RECEIVED`, `OFFER_ACCEPTED`, `NEW_MESSAGE`, `REQUEST_EXPIRED`, `REQUEST_CANCELLED`, `ORDER_STATUS_CHANGED`, `PHARMACY_ORDER_UPDATE`, `DELIVERY_CODE`, `PICKUP_CODE`, `COLLECTION_CODE`, `DELIVERY_JOB_AVAILABLE`, `PAYMENT_CONFIRMED`, `PAYMENT_FAILED`, `REFUND_COMPLETED`, `ACCOUNT_STATUS_CHANGED`, `VERIFICATION_DECIDED`, `ADMIN_ALERT`, `COMPLAINT_OUTCOME`.

Notification titles and bodies never contain medicine names. One-time codes are only rendered for the recipient.
