# Pharmacy app – screens and endpoints

Roles `PHARMACY_OWNER`, `PHARMACIST`, `PHARMACY_ASSISTANT` (staff roles OWNER / PHARMACIST / ASSISTANT). The full role matrix is in [04-pharmacy §1](../api/04-pharmacy.md#1-role-matrix). Most features need the pharmacy to be **VERIFIED** (`403 PHARMACY_NOT_VERIFIED` otherwise). cURL examples: [curl/pharmacy.md](./curl/pharmacy.md).

What each role can do:
- Assistants can prepare and hand over orders, but **never see prescription or Chifa files** and cannot validate prescriptions.
- Validating a prescription needs an OWNER or PHARMACIST account.

## Onboarding and verification

| Screen | Calls | Reference |
|---|---|---|
| Register the pharmacy | `POST /pharmacies/register` (owner + pharmacy, DRAFT) → OTP verify → log in | [04-pharmacy §2](../api/04-pharmacy.md#2-registration--verification) |
| Join as staff (invitation) | `POST /auth/invitations/preview { invitation_token }` → `POST /auth/register/staff` | [02-auth §11](../api/02-auth.md#11-pharmacy-staff-invitations) |
| Verification checklist | `GET /pharmacy/verification` (missing documents, `can_submit`, rejection reason) | |
| Upload documents | `POST /files/upload` (purpose `PHARMACY_DOC`) → `POST /pharmacy/documents { doc_type, file_id }`; `GET /pharmacy/documents`, `DELETE /pharmacy/documents/:id` | |
| Submit for review | `POST /pharmacy/verification/submit` | Then wait for the admin decision (VERIFICATION_DECIDED notification) |
| MFA (recommended for staff) | `POST /auth/mfa/setup` → `POST /auth/mfa/enable`; login then needs `POST /auth/login/mfa` | [02-auth §8](../api/02-auth.md#8-mfa-totp) |

## Pharmacy settings

| Screen | Calls |
|---|---|
| Profile | `GET /pharmacy/me`, `PATCH /pharmacy/me` (OWNER; legal fields locked once VERIFIED) |
| Opening hours | `GET /pharmacy/opening-hours`, `PUT /pharmacy/opening-hours` |
| On duty (garde) | `GET /pharmacy/on-duty`, `POST /pharmacy/on-duty`, `DELETE /pharmacy/on-duty/:id` |
| Service areas | `GET/POST /pharmacy/service-areas`, `PUT/DELETE /pharmacy/service-areas/:id` |
| Staff | `GET /pharmacy/staff`, `POST /pharmacy/staff/invite`, `PATCH /pharmacy/staff/:staffId`; invitations: `GET /pharmacies/:id/staff/invitations`, `DELETE …/:invitationId` |
| Payout accounts (OWNER) | `GET/POST /pharmacy/payout-accounts`, `DELETE …/:id` (numbers stored encrypted, shown masked) |
| Stock | `GET /pharmacy/stock`, `PUT /pharmacy/stock/:medicineId`, `DELETE …/:medicineId`, CSV `POST /pharmacy/stock/import` (`dry_run=true` to validate) — [04-pharmacy §4](../api/04-pharmacy.md#4-catalog--stock) |

## Requests and offers

| Screen | Calls | Notes |
|---|---|---|
| Request inbox | `GET /pharmacy/requests?status=` | Socket event `request.status_changed`; **delivery area only** (commune), never the full address |
| Request detail | `GET /pharmacy/requests/:id`; prescription pages via `GET /files/:id/access-url` (OWNER / PHARMACIST only, logged) | [04-pharmacy §5](../api/04-pharmacy.md#5-request-inbox) |
| Take / decline | `POST /pharmacy/requests/:id/accept-interest`, `POST /pharmacy/requests/:id/decline { reason }` | |
| Ask the patient | `POST /pharmacy/requests/:id/clarification { question }`, then chat in `/conversations/:id/messages` | [05-messaging §2](../api/05-messaging-notifications.md#2-clarification-flow) |
| Build an offer | `POST /pharmacy/requests/:id/offers` (items, prices in centimes, availability, alternatives, `delivery_available`) → `PATCH /pharmacy/offers/:id` → `POST /pharmacy/offers/:id/send` | Delivery fee and totals are computed by the server ([04-pharmacy §6](../api/04-pharmacy.md#6-offers)) |
| My offers | `GET /pharmacy/offers`, `GET /pharmacy/offers/:id`, `POST /pharmacy/offers/:id/withdraw` | |

## Orders and fulfilment

| Screen | Calls | Notes |
|---|---|---|
| Orders board | `GET /pharmacy/orders?status=` | Socket event `order.status_changed`; columns by status ([statuses.md](./statuses.md#order-ordersstatus)) |
| Order detail | `GET /pharmacy/orders/:id` (`next_actions` drives the buttons), `GET /pharmacy/orders/:id/timeline` | [06-orders §4](../api/06-orders.md#4-pharmacy-endpoints-pharmacyorders-staff-of-the-orders-pharmacy) |
| Validate prescription | `POST /pharmacy/orders/:id/validate { decision: APPROVE \| REJECT, confirm: true, note }` (OWNER / PHARMACIST) | Explicit confirmation required |
| Prepare | `POST /pharmacy/orders/:id/start-preparing` → `POST /pharmacy/orders/:id/ready` | Ready on a delivery order creates the delivery job and sends you a PICKUP_CODE |
| Counter hand-over | `POST /pharmacy/orders/:id/handover { collection_code }` | 5 attempts, then the patient must regenerate the code |
| Cancel | `POST /pharmacy/orders/:id/cancel { reason }` | |
| Delivery | `GET /pharmacy/orders/:id/delivery`, `POST …/delivery/pickup-code` (show to the driver), `POST …/delivery/confirm-return` (failed parcel back) | [08-delivery §6](../api/08-delivery.md#6-pharmacy-owner--pharmacist--assistant) |
| Partial refund | `POST /pharmacy/orders/:id/refund-request { amount_centimes?, reason }` | An admin approves it |

## Reports, settlements, complaints

| Screen | Calls |
|---|---|
| Dashboard | `GET /pharmacy/reports/summary` |
| Settlements | `GET /pharmacy/settlements` (records only; paid off-platform for now) |
| Complaints | `GET /pharmacy/complaints`, `GET /pharmacy/complaints/:id`, `POST /pharmacy/complaints/:id/reply` |
| Notifications | `GET /notifications`, `POST /notifications/:id/read`, `GET/PATCH /notifications/preferences` |
