# Delivery apps – screens and endpoints

Two audiences:
- the **driver app** (role `DRIVER`);
- the **delivery company console** (role `DELIVERY_COMPANY_ADMIN`).

Field tables: [../api/08-delivery.md](../api/08-delivery.md). cURL examples: [curl/delivery.md](./curl/delivery.md).

> Privacy by design: these apps **never** receive prescriptions, medicine names, order items, Chifa data or national IDs. The API fails closed if a response ever contains such a field. The parcel is identified by an opaque label (`PKG-XXXXXX`).

## Onboarding (both)

| Screen | Calls |
|---|---|
| Sign up | `POST /delivery/register { account_type: COMPANY \| DRIVER, … }` → `POST /auth/otp/verify` → `POST /auth/login` |
| Verification status | Driver: `GET /delivery/me` (`status`, `account_status`, `can_take_jobs`, documents). Company: `GET /delivery/company` |
| Documents | `POST /files/upload` (purpose `DRIVER_DOC` or `DELIVERY_COMPANY_DOC`) → `POST /delivery/me/documents` or `POST /delivery/company/documents { doc_type, file_id }` |
| Waiting for approval | Accounts stay `PENDING_VERIFICATION` until an admin approves them (VERIFICATION_DECIDED notification). The job board returns `403` until then |

## Driver app

| Screen | Calls | Notes |
|---|---|---|
| Go online / offline | `PATCH /delivery/me/availability { is_available }` | Going online requires a verified driver |
| Background location | `PATCH /delivery/me/location { latitude, longitude }` | **At most once every 10 s** (`429 DELIVERY_LOCATION_THROTTLED` with `details.retry_after_seconds`) |
| Job board | `GET /delivery/jobs/available?radius_km=20` (or `wilaya_id` / `commune_id`) | Shows the pickup pharmacy, the destination **area**, fee and payout; push DELIVERY_JOB_AVAILABLE |
| Job card | `GET /delivery/jobs/:id` | |
| Accept | `POST /delivery/jobs/:id/accept` | `409 DELIVERY_ALREADY_TAKEN` → remove the card and refresh the board |
| My jobs | `GET /delivery/jobs/active` | The full drop-off (first name, phone, address, GPS, notes) appears after acceptance |
| Release (before pickup) | `POST /delivery/jobs/:id/release { reason }` | Limited per day (`429 DELIVERY_RELEASE_LIMIT_REACHED`) |
| At the pharmacy | `POST /delivery/jobs/:id/confirm-pickup { pickup_code }` | The pharmacy shows the 6-digit code; a wrong code shows `details.attempts_remaining`, and the code locks after 5 attempts |
| Start the trip | `POST /delivery/jobs/:id/start { eta_minutes? }` | The patient now sees the live position |
| Hand-over | `POST /delivery/jobs/:id/confirm-delivery` with **exactly one** of: `delivery_code` (the patient's OTP, preferred), `signature_file_id`, or `photo_file_id` + `photo_has_no_face: true` | Upload signatures and photos with purpose `PROOF_OF_DELIVERY`. **Never photograph faces** |
| Failed delivery | `POST /delivery/jobs/:id/fail { reason, attempts }` → bring the parcel back → `POST /delivery/jobs/:id/confirm-return` | The pharmacy then confirms receipt |
| History | `GET /delivery/history?status=` | |
| Earnings | `GET /delivery/earnings?from&to` | Records only (paid off-platform) |
| Join a company | `POST /delivery/invitations/accept { token }` | The token comes by SMS / e-mail to the driver's own number / address |

Live updates: socket events `delivery.status_changed` and `notification.new` ([realtime.md](./realtime.md)).

## Company console

| Screen | Calls |
|---|---|
| Company profile and documents | `GET /delivery/company`, `POST /delivery/company/documents` |
| Drivers | `GET /delivery/company/drivers?available=`, `DELETE /delivery/company/drivers/:id` (not while carrying a parcel: `409 DELIVERY_DRIVER_BUSY`) |
| Invitations | `POST /delivery/company/invitations { phone \| email }` (company must be VERIFIED), `GET /delivery/company/invitations`, `DELETE /delivery/company/invitations/:id` |
| Reports | `GET /delivery/company/reports?from&to` (volumes, success rate, fees, payouts, per driver) |
