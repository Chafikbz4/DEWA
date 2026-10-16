# Phase 7 report – Payments, refunds, receipts, settlements

## Built
- `IPaymentProvider` interface (`PAYMENT_PROVIDER` token), selected by `PAYMENT_PROVIDER=mock|satim`.
  - **MockPaymentProvider** – the only working provider: in-memory gateway, hosted-page simulation, HMAC-signed webhooks (`x-mock-signature`), test switches for outages.
  - **SatimEdahabiaProvider** – **skeleton only**. Every method throws `NotImplemented` with `TODO(official-doc)` notes listing the required inputs. No SATIM/CIB/Edahabia API details were assumed.
- Checkout breakdown (lines, medicines subtotal, delivery fee, service fee, total, deadline, provider, collection model).
- `POST /orders/:id/pay` with a **required** Idempotency-Key. The amount always comes from the server-side order. The online-payment eligibility policy is checked per category. Double payments are blocked by the order version lock and the unique idempotency key.
- `verifyAndApply` is the **only** path to `CONFIRMED`. It runs a server-to-server status check and an amount check, then moves the order (the payment-first variant goes on to pharmacist validation) and issues the receipt atomically. Polling, the browser return, webhooks and the reconciliation job all go through it.
- Webhooks: stored first, signature-checked, de-duplicated (`provider_event_id` unique → replay protection) and processed idempotently. Invalid signatures get a 401, and the event is kept and audited.
- Receipts `RCP-YYYY-NNNNNN` with a frozen snapshot, as JSON or PDF (`StreamableFile`; the envelope interceptor now passes binary responses through unchanged).
- Refunds: an automatic full refund when an order enters `REFUND_PENDING`, partial refunds requested by the patient or pharmacy, admin approve/reject, provider errors that can be retried, and payment/order → `REFUNDED` once the full amount is refunded.
- Reconciliation job (every 5 min) and admin queue: AMOUNT_MISMATCH, DUPLICATE_PAYMENT, STALE_PENDING, MISSING_PAYMENT, ORPHAN_EVENT, PAID_ORDER_NOT_PAYABLE. Resolving an issue is audited.
- Settlements (**records only**): daily job per closed period, commission rules (pharmacy-specific, else global; PERCENT in basis points, FIXED per order), refunds deducted, admin approve / mark-paid (off-platform transfer reference), pharmacy read-only view.
- Notifications: PAYMENT_CONFIRMED, PAYMENT_FAILED, REFUND_COMPLETED (no medicine names).

## Endpoints
| Method | Path | Role |
|---|---|---|
| GET | /orders/:id/checkout | PATIENT |
| POST | /orders/:id/pay | PATIENT (Idempotency-Key) |
| GET | /orders/:id/payments | PATIENT |
| GET | /payments/:id/status | PATIENT |
| GET | /orders/:id/receipt (`?format=pdf`) | PATIENT |
| POST | /orders/:id/refund-request | PATIENT |
| GET | /orders/:id/refunds | PATIENT |
| POST | /pharmacy/orders/:id/refund-request | OWNER / PHARMACIST |
| GET | /pharmacy/settlements | pharmacy staff |
| POST | /payments/webhook/:provider | public (signed) |
| GET | /payments/return/:paymentId | public (informational) |
| GET | /payments/mock/checkout/:providerOrderId | public, mock only, disabled in production |
| POST | /payments/mock/:providerOrderId/simulate | public, mock only, disabled in production |
| GET | /admin/payments/reconciliation | ADMIN / SUPER_ADMIN |
| POST | /admin/payments/reconciliation/run | ADMIN / SUPER_ADMIN |
| POST | /admin/payments/reconciliation/:id/resolve | ADMIN / SUPER_ADMIN |
| GET | /admin/refunds | ADMIN / SUPER_ADMIN |
| POST | /admin/refunds/:id/approve, /reject | ADMIN / SUPER_ADMIN |
| GET | /admin/settlements | ADMIN / SUPER_ADMIN |
| POST | /admin/settlements/generate, /:id/approve, /:id/mark-paid | ADMIN / SUPER_ADMIN |

Details: [docs/api/07-payments.md](../api/07-payments.md).

## Migration
`0010_payments_reconciliation.sql` adds:
- the `payment_reconciliation_issues` table, with CHECK constraints on kind and status;
- the columns `payments.initiated_by_user_id` and `payments.expires_at`.

## Configuration
- `PAYMENT_PROVIDER` (`mock` by default).
- `MOCK_PAYMENT_WEBHOOK_SECRET` (optional; a random secret is generated for each process when unset, so there is no secret in the code).
- The JSON parser keeps `rawBody` only for `/payments/webhook/*`, so the signature can be checked against the exact bytes.

## Tests
- Unit: 73 passed (no regressions).
- e2e `test/payments.e2e-spec.ts` (8), all against the mock:
  - full pay → server verification → receipt (JSON and PDF);
  - **the client says it succeeded** (return URL, polling, signed but premature webhook): not confirmed;
  - **unsigned webhook** rejected and stored; **replayed event id** ignored; **duplicate webhook** harmless;
  - **amount mismatch**: never confirmed, issue opened, admin resolves it;
  - **double pay click** (same key replayed; two concurrent keys give 201 and 409, with exactly one payment row);
  - provider outage and decline put the order back to AWAITING_PAYMENT;
  - **refund flow**: partial refund, refund-amount cap, automatic full refund on cancellation, provider failure then retry, order → REFUNDED;
  - reconciliation job confirms a pending payment, then settlement generation with commission, approve and mark-paid.

## Assumptions
1. The browser return and webhooks are informational only. Confirmation always needs the provider's server-side status and an exact amount match.
2. Refunds are executed only after admin approval, including the automatic full refund (it is created automatically and approved by a human).
3. A captured amount that differs from the order is never confirmed automatically. An admin resolves it, for example by refunding outside the platform.
4. The receipt is a platform payment receipt, not the pharmacy's fiscal invoice. PDFs are in French for now; Arabic PDFs need an embedded Arabic font (Phase 10).
5. Settlement periods are aligned on Monday 2026-01-05 and last `settlement_period_days` days (7 by default).

## Open legal / commercial questions
- **Collection model** (`payment_collection_model`): either MARKETPLACE (the platform collects and pays pharmacies out, which needs a legal basis and possibly payment-institution status) or PER_PHARMACY_MERCHANT. Until this is decided, settlements are records only and no payout API exists.
- **SATIM/Edahabia**: we need the merchant contract and the official integration kit: endpoints, credentials, signature scheme, status codes, refund/reversal support and the test environment.
- Whether online payment is allowed for each medicine category (eligibility policies are disabled by default).
- Whether service fees may be charged on medicines (`service_fee_centimes` is 0 for now).
- Commission rules need legal review before they are activated (`legal_review_note`).
