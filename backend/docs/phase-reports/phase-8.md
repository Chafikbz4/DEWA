# Phase 8 report – Delivery

## Built
- **Onboarding**:
  - `POST /delivery/register` creates a company (the registrant becomes its admin) or an independent driver, both PENDING_VERIFICATION.
  - Documents go in `driver_documents` (new) and `delivery_company_documents`, using the new file purpose `DELIVERY_COMPANY_DOC`.
  - Company admins invite drivers. The token is HMAC-hashed and must match the driver's own phone or email. Admins can list and remove drivers (not while the driver carries a parcel).
  - Unverified drivers, and drivers of unverified companies, see no jobs.
- **Job creation**: an onEnter hook on `READY_FOR_PICKUP` (delivery orders, coming from PREPARING) creates the job inside the same transaction:
  - pickup and drop-off snapshots, with no medical data;
  - an opaque `PKG-XXXXXX` label;
  - fee and payout taken from the order;
  - HMAC-hashed pickup and delivery codes, sent as encrypted one-time notifications (PICKUP_CODE to the pharmacy staff, DELIVERY_CODE to the patient);
  - a DELIVERY_JOB_AVAILABLE alert to nearby available drivers.
- **Job board**: AVAILABLE jobs within `radius_km` of the driver's last position (PostGIS), or filtered by destination wilaya/commune. Each card shows the pickup pharmacy, destination area, fee and payout. The full drop-off is shown only to the assigned driver.
- **Accept**: atomic, first come first served (optimistic lock on `deliveries.version` together with the order transition). The losing driver gets 409 DELIVERY_ALREADY_TAKEN.
- **Release**: needs a reason and is limited by `delivery_max_releases_per_day`; only possible before pickup.
- **Execution**: confirm-pickup (code), start (ETA), throttled location updates (streamed to the patient only while OUT_FOR_DELIVERY), confirm-delivery, fail, then confirm-return by the driver and receipt confirmation by the pharmacy.
  - Confirming delivery needs **exactly one** proof: OTP, signature, or a photo plus a no-face confirmation.
  - Both codes lock after `delivery_code_max_attempts`. Wrong attempts are saved even though the request fails. The pharmacy or patient regenerates a code to reset the lock.
  - Every step goes through the order state machine, the delivery status history and realtime events.
  - Cancelling or refunding an order before pickup cancels its job.
- **Failure and return**: driver fails the job → order FAILED → driver brings the parcel back → the pharmacy confirms → delivery RETURNED, order REFUND_PENDING, and the automatic refund request (Phase 7) is created.
- **Tracking and reporting**:
  - Patient: status, driver first name, vehicle, ETA, and live position only while OUT_FOR_DELIVERY.
  - Pharmacy: delivery view, pickup-code regeneration, return confirmation.
  - Driver: history and earnings (records only).
  - Company: reports (volumes, success rate, fees, payouts, per driver).
- **Privacy**:
  - `DriverPrivacyInterceptor` on all driver and company controllers fails closed (500, field names logged) if a forbidden key is ever served. Paginated rows are scanned.
  - Proof-of-delivery files can be read by the patient, the pharmacy staff and the uploading driver.

## Endpoints
See [docs/api/08-delivery.md](../api/08-delivery.md):
- driver: 16 endpoints;
- company: 8 endpoints;
- patient: `GET /orders/:id/delivery`, `POST /orders/:id/delivery/code`;
- pharmacy: `GET /pharmacy/orders/:id/delivery`, `POST …/pickup-code`, `POST …/confirm-return`;
- public: `POST /delivery/register`.

## Migration
`0011_delivery_execution.sql` adds:
- the enum `driver_doc_type` and the file purpose `DELIVERY_COMPANY_DOC`;
- the tables `driver_documents` and `delivery_driver_invitations`;
- the columns `deliveries.pickup_code_attempts`, `delivery_code_attempts`, `delivery_attempts` and `returned_by_driver_at`, with a CHECK constraint.

## Tests
- Unit (`delivery-privacy.spec.ts`):
  - the forbidden-key scanner;
  - the fail-closed interceptor, including paginated responses;
  - the full 8 × 8 delivery transition matrix.
- e2e (`test/delivery.e2e-spec.ts`, 8 tests):
  - registration of both account types;
  - job creation (label, hashes, notifications), plus the pending-driver, unverified-company and verified-driver board views;
  - **race on accept** (exactly one 200 and one 409, a single ASSIGNED history row, the loser gets 404 on the job);
  - **wrong OTP attempts and lockout**: wrong pickup code, four wrong delivery codes, the fifth locks, the correct code is refused while locked, and regeneration unlocks;
  - proof validation (none, two, photo without the no-face flag, someone else's file);
  - live tracking and the location throttle;
  - history and earnings;
  - release with a reason and the daily limit, with no release after pickup;
  - **failed delivery and return flow** → REFUND_PENDING and a refund request;
  - company invitation (token bound to the target), drivers list, reports, role checks;
  - **forbidden-field scan**: every driver and company response collected in the suite is checked for forbidden keys, the medicine name, the prescription file id and the request item ids.

## Assumptions
1. Until the commercial model is decided, the driver payout equals the delivery fee paid by the patient. Driver and company payouts are records only, paid off-platform.
2. Code attempts and the location interval reuse the existing settings (`delivery_code_max_attempts` = 5, `driver_location_min_interval_seconds` = 10). The daily release limit counts per UTC day.
3. A signature or a no-face photo is accepted as an alternative to the OTP (for example, when the patient cannot read their SMS). The proof type is recorded and shown to the patient and the pharmacy. The photo's "no face" status is the driver's declaration; nothing checks it automatically.
4. Drivers have no fixed zones. The board uses the distance from the driver's last position, or the destination filters.
5. Admin verification of companies, drivers and their documents is part of Phase 9, as for pharmacies.

## Open legal / commercial questions
- The legal basis for delivering each medicine category (eligibility `allowed_delivery`, disabled by default), and whether prescription medicines may be delivered at all.
- The driver payout model (share of the fee, platform commission, who invoices whom) and the delivery companies' contractual status.
- Whether signature or photo proofs are acceptable for prescription medicines, or whether the OTP should be mandatory.
- How long location data is kept (Phase 10 retention policy). Today only the last position is stored, with no location history.
