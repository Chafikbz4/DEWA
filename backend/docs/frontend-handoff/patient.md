# Patient app – screens and endpoints

Role `PATIENT`. Exact request and response field tables are in the linked reference sections; schemas are in [`../openapi.json`](../openapi.json); cURL examples are in [curl/patient.md](./curl/patient.md) and [curl/common.md](./curl/common.md).

## Onboarding and account

| Screen | Calls | Reference |
|---|---|---|
| Welcome / language | none; store `ar` or `fr` and send it as `Accept-Language` | [README §2](./README.md#2-headers) |
| Sign up | `POST /auth/register/patient` (consents TERMS + PRIVACY at their current versions) | [02-auth §3](../api/02-auth.md#3-registration) |
| Verify phone | `POST /auth/otp/verify`, resend with `POST /auth/otp/request` (cooldown) | [02-auth §4](../api/02-auth.md#4-otp) |
| Log in | `POST /auth/login`, or `POST /auth/login/otp` (SMS) | [02-auth §5](../api/02-auth.md#5-login) |
| Forgot password | `POST /auth/password/forgot` → `POST /auth/password/reset` | [02-auth §7](../api/02-auth.md#7-passwords) |
| Biometric login setup | `POST /auth/devices { device_id, biometric_enabled: true }`, then `POST /auth/refresh { refresh_token, device_id }` | [02-auth §9](../api/02-auth.md#9-devices--biometric-login) |
| Profile | `GET /patients/me`, `PATCH /patients/me` (national ID encrypted; shown masked) | [03-patient](../api/03-patient.md) |
| Addresses | `GET/POST /patients/me/addresses`, `PATCH/DELETE /patients/me/addresses/:id`, `POST …/:id/default`; wilaya / commune pickers via `GET /geo/wilayas`, `GET /geo/wilayas/:id/communes` | [03-patient](../api/03-patient.md) |
| Dependants (children, elderly parents) | `GET/POST /patients/me/dependants`, `PATCH/DELETE …/:id`; proof upload with purpose `DEPENDANT_PROOF` (an admin verifies it) | [03-patient](../api/03-patient.md) |
| Consents | `GET /me/consents`, `POST /me/consents`, `DELETE /me/consents/:type` | [02-auth §10](../api/02-auth.md#10-me--consents) |
| Sessions and devices | `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `GET/DELETE /auth/devices` | [02-auth §6](../api/02-auth.md#6-refresh-logout-sessions) |
| Notification settings | `GET/PATCH /notifications/preferences` (security codes cannot be muted) | [05-messaging](../api/05-messaging-notifications.md) |
| Privacy | `POST /me/data-export` (downloads JSON), `POST /me/delete-account { password, confirm: true }` | [README §3](./README.md#3-authentication-and-token-refresh) |

## Requesting medicines

| Screen | Calls | Notes |
|---|---|---|
| New request: photo of the prescription | `POST /files/upload` (purpose `PRESCRIPTION`, up to 5 pages); optional Chifa card (`CHIFA_CARD`) | The file type is checked from the content |
| New request: items | No call; free-text `raw_name` + quantity; catalogue autocomplete with `GET /medicines/search?q=` | |
| New request: pharmacies | `POST /requests/preview-matching` (nearby open pharmacies), or `GET /pharmacies/nearby?lat&lng&radius` | The patient may pick pharmacies or let matching choose |
| New request: confirm | `POST /requests` with `consent_to_share: true` (per-request sharing consent) | `REQUEST_*` errors explain category restrictions |
| My requests | `GET /requests?status=&page=` | Status badges: [statuses.md](./statuses.md#request-requestsstatus) |
| Request detail | `GET /requests/:id`; edit items while allowed with `POST /requests/:id/items`, `PATCH/DELETE …/items/:itemId`; `POST /requests/:id/cancel` | |
| Pharmacist question | `GET /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages`, `POST …/read` | Socket event `message.new`; phone numbers are refused in messages |
| Offers list | `GET /requests/:id/offers` | Socket event `offer.new` |
| Compare offers | `GET /requests/:id/offers/compare` | Totals in centimes; delivery fee computed by the server |
| Offer detail | `GET /offers/:id`; approve or refuse a proposed alternative with `POST /offers/:id/items/:itemId/approval` | |
| Accept offer | `POST /offers/:id/accept { fulfillment_type: PICKUP \| DELIVERY }` (send an `Idempotency-Key`) | Returns the order |

## Orders, payment, delivery

| Screen | Calls | Notes |
|---|---|---|
| My orders | `GET /orders?status=` | |
| Order detail | `GET /orders/:id` (includes `next_actions`), `GET /orders/:id/timeline` (localized labels) | Socket event `order.status_changed` |
| Checkout | `GET /orders/:id/checkout` | Transparent breakdown, deadline, provider |
| Pay | `POST /orders/:id/pay` with an **Idempotency-Key**; open `redirect_url`; poll `GET /payments/:id/status` | Success only on `CONFIRMED` ([README §8](./README.md#8-payments-in-the-app)) |
| Payment attempts | `GET /orders/:id/payments` | |
| Receipt | `GET /orders/:id/receipt` (JSON) or `?format=pdf` | |
| Cancel | `POST /orders/:id/cancel { reason }` | Refund is automatic if already paid |
| Pickup code | `POST /orders/:id/collection-code` (also sent as a COLLECTION_CODE notification) | Show it big on screen at the counter |
| Delivery tracking | `GET /orders/:id/delivery` (driver first name, vehicle, ETA, `live_location` only while OUT_FOR_DELIVERY) | Socket events `delivery.status_changed` and `delivery.location` ([08-delivery §5](../api/08-delivery.md#5-patient-tracking-role-patient)) |
| Delivery code | `POST /orders/:id/delivery/code` (new code; also sent as DELIVERY_CODE) | Give it to the driver at the door |
| Refunds | `GET /orders/:id/refunds`, `POST /orders/:id/refund-request { amount_centimes?, reason }` | [07-payments §6](../api/07-payments.md#6-refunds) |

## Support and notifications

| Screen | Calls |
|---|---|
| Notification centre | `GET /notifications` (`meta.unread_count`), `POST /notifications/:id/read`, `POST /notifications/read-all`; socket event `notification.new` |
| Complaints | `POST /complaints`, `GET /complaints`, `GET /complaints/:id`, `POST /complaints/:id/messages` |
