# 05 – Realtime (Socket.IO)

REST is the **source of truth**. Socket events only tell the app *that something changed* (ids + statuses); refetch the resource over REST to display it. Events never contain message bodies, prices, medicine names or personal data.

## Connecting

- URL: `<base>/realtime` (Socket.IO namespace), transport `websocket` recommended.
- Auth: the same **access token** as REST.

```ts
import { io } from 'socket.io-client';

const socket = io(`${BASE_URL}/realtime`, {
  auth: { token: accessToken },
  transports: ['websocket'],
});
socket.on('connected', ({ user_id }) => { /* ready */ });
socket.on('error', ({ code }) => { /* AUTH_TOKEN_MISSING | AUTH_TOKEN_INVALID | AUTH_TOKEN_EXPIRED | AUTH_SESSION_REVOKED | ACCOUNT_SUSPENDED */ });
```

- Invalid / expired token → server emits `error { code }` then disconnects. Refresh the token (`POST /auth/refresh`) and reconnect with the new access token.
- The access token is checked **at connection time**. When its session is revoked (logout, logout-all, password reset, suspension, role change, device removal) the server **disconnects** the socket.
- Reconnect after every token refresh (the old token stops working at its expiry).
- CORS: same allowlist as REST (`CORS_ORIGINS`).

Rooms (joined automatically): `user:<userId>` for everyone; `pharmacy:<pharmacyId>` for active pharmacy staff.

## Events (server → client)

Every payload also contains `emitted_at` (ISO datetime).

| Event | Sent to | Payload | Refetch |
|---|---|---|---|
| `connected` | the socket | `{ user_id }` | — |
| `message.new` | patient + pharmacy staff of the conversation | `{ conversation_id, message_id, request_id, message_type, sender_user_id }` | `GET /conversations/:id/messages` |
| `offer.new` | patient | `{ offer_id, request_id, pharmacy_id }` | `GET /offers/:id` |
| `request.status_changed` | patient + recipient pharmacies | `{ request_id, reference, from, to }` | `GET /requests/:id` or `GET /pharmacy/requests/:id` |
| `order.status_changed` | patient + pharmacy | `{ order_id, reference, from, to }` | `GET /orders/:id` |
| `delivery.status_changed` | patient + pharmacy + assigned driver | `{ delivery_id, order_id, from, to }` | `GET /orders/:id/delivery` / driver job |
| `delivery.location` | patient (only while OUT_FOR_DELIVERY) | `{ order_id, latitude, longitude, updated_at }` | — |
| `notification.new` | the user | `{ notification_id, type }` | `GET /notifications` (badge) |
| `error` | the socket | `{ code }` | — |

No client → server events are required.

## Scaling

With several API instances, enable a Socket.IO Redis adapter (same `REDIS_URL`) so events reach clients connected to other instances. The single-instance default needs nothing.
