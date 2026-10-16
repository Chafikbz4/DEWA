# 06 – Orders API

Design, full transition table, timeouts and variants: **[../06-order-state-machine.md](../06-order-state-machine.md)**.
Conventions: [00-conventions.md](./00-conventions.md) · errors: [errors.md](./errors.md).

## 1. Statuses (for labels use `labels.order_status.*` in `src/i18n/{ar,fr}.json`)

| Status | Patient label (fr) | Meaning |
|---|---|---|
| `PHARMACIST_VALIDATION_PENDING` | Validation par le pharmacien | A pharmacist must check the order against the prescription |
| `AWAITING_PAYMENT` | En attente de paiement | Patient can pay until `payment_deadline_at` |
| `PAYMENT_PENDING` | Paiement en cours | Payment started, being verified with the provider |
| `PAYMENT_CONFIRMED` | Paiement confirmé | Verified server-side |
| `PREPARING` | En préparation | |
| `READY_FOR_PICKUP` | Prête | Pickup: show the collection code · Delivery: waiting for a courier |
| `DELIVERY_ASSIGNED` · `PICKED_UP` · `OUT_FOR_DELIVERY` | Livreur assigné · Récupérée · En route | Phase 8 |
| `DELIVERED` / `COMPLETED` | Livrée / Retirée | Final success (delivery / pickup) |
| `CANCELLED` | Annulée | Nothing was captured |
| `REFUND_PENDING` → `REFUNDED` | Remboursement en cours → Remboursée | Phase 7 |
| `FAILED` | Livraison échouée | Goods return to the pharmacy, then refund |

`workflow_variant`: `VALIDATION_FIRST` (default – pharmacist validates before payment) or `PAYMENT_FIRST` (setting `payment_before_validation`, legal decision pending). Frozen per order.

Every order response includes `next_actions` – the buttons to show: patient `PAY`, `CANCEL`; pharmacy `VALIDATE`, `START_PREPARING`, `MARK_READY`, `HANDOVER`, `CANCEL`.

## 2. Accept an offer – POST /offers/:id/accept (PATIENT)

Headers: `Idempotency-Key` (optional, 8–128 chars `[A-Za-z0-9_.:-]`) – retries with the same key and body replay the first response (24 h).

Body:

| Field | Type | Required | Rules |
|---|---|---|---|
| `fulfillment_type` | `PICKUP` \| `DELIVERY` | yes | DELIVERY needs the offer's `delivery_available`, the request's `delivery_wanted`, setting `delivery_enabled` and category policies allowing delivery |

Checks, in order: offer SENT (`ORDER_OFFER_NOT_AVAILABLE`), not expired (`OFFER_EXPIRED`), request still open, **every substitution decided** (`ORDER_ALTERNATIVES_PENDING`), at least one orderable line (`ORDER_NOTHING_TO_ORDER`), categories still allowed (`REQUEST_CATEGORY_RESTRICTED`), delivery allowed (`ORDER_DELIVERY_NOT_AVAILABLE`), stock not OUT_OF_STOCK (`ORDER_ITEM_OUT_OF_STOCK`).

Effects (one transaction): offer → ACCEPTED; other offers → REJECTED; request → OFFER_ACCEPTED; order created with **frozen** lines (UNAVAILABLE lines and REJECTED alternatives excluded) and totals (`items_subtotal` = included lines, `delivery_fee` only for DELIVERY, `service_fee` from the offer); history row; pharmacy notified (`OFFER_ACCEPTED`). Two concurrent accepts → one `201`, one `409 ORDER_OFFER_NOT_AVAILABLE` (conditional update + partial unique index).

`201` → patient order view (below). Reference `ORD-YYYY-NNNNNN`.

## 3. Patient endpoints (role PATIENT)

| Method | Path | Notes |
|---|---|---|
| GET | `/orders` | pagination, `status` (comma list), `from`, `to`, `sort` = created_at \| updated_at |
| GET | `/orders/:id` | full view |
| GET | `/orders/:id/timeline` | localized history |
| POST | `/orders/:id/cancel` | `{ reason: 3–500 }` |
| POST | `/orders/:id/collection-code` | pickup orders in READY_FOR_PICKUP: new code `{ order_id, collection_code }` (returned once, resets attempts) |

**Patient view**:

| Field | Type |
|---|---|
| `id`, `reference`, `request_id`, `offer_id` | |
| `status`, `workflow_variant`, `fulfillment_type` | |
| `items` | `[{ id, name, quantity, unit_price_centimes, line_total_centimes }]` |
| `items_subtotal_centimes`, `delivery_fee_centimes`, `service_fee_centimes`, `total_centimes`, `currency` (DZD) | |
| `pharmacist_validated`, `pharmacist_validated_at`, `validation_note` | |
| `payment_deadline_at` | datetime \| null |
| `pharmacy` | `{ id, name_fr, name_ar, address_line, phone, latitude, longitude }` |
| `delivery_address` | frozen snapshot (DELIVERY) \| null |
| `cancel_reason`, `cancelled_at`, `created_at`, `updated_at` | |
| `next_actions` | string[] |

**Cancellation by the patient**:

| Current status | Result |
|---|---|
| PHARMACIST_VALIDATION_PENDING (validation-first), AWAITING_PAYMENT, PAYMENT_PENDING | `CANCELLED` (free) |
| PAYMENT_CONFIRMED, PHARMACIST_VALIDATION_PENDING (payment-first) | `REFUND_PENDING` (refund, Phase 7) |
| PREPARING, READY_FOR_PICKUP, DELIVERY_ASSIGNED | `409 ORDER_CANCEL_REQUIRES_APPROVAL` – ask the pharmacy / support |
| PICKED_UP and later, terminal statuses | `409 ORDER_NOT_CANCELLABLE` |

**Timeline**: `{ order_id, reference, current_status, events: [{ status, label, description, from_status, actor: PATIENT|PHARMACY|DRIVER|PLATFORM, reason, at }] }` – labels in the caller's `preferred_language`; staff names never shown.

## 4. Pharmacy endpoints (`/pharmacy/orders`, staff of the order's pharmacy)

| Method | Path | Staff role | Body | Transition |
|---|---|---|---|---|
| GET | `/pharmacy/orders` | all | query as patient list | |
| GET | `/pharmacy/orders/:id` | all | | |
| GET | `/pharmacy/orders/:id/timeline` | all | | |
| POST | `/pharmacy/orders/:id/validate` | **OWNER, PHARMACIST** | `{ decision: APPROVE\|REJECT, confirm: true, note: 3–1000 }` | VF: APPROVE → AWAITING_PAYMENT (deadline starts), REJECT → CANCELLED · PF: APPROVE → PREPARING, REJECT → REFUND_PENDING |
| POST | `/pharmacy/orders/:id/start-preparing` | all | — | PAYMENT_CONFIRMED → PREPARING (VF) |
| POST | `/pharmacy/orders/:id/ready` | all | — | PREPARING → READY_FOR_PICKUP (pickup: collection code sent to patient; delivery: delivery job created, Phase 8) |
| POST | `/pharmacy/orders/:id/handover` | all | `{ collection_code: 6 digits }` | READY_FOR_PICKUP → COMPLETED (pickup). 5 wrong codes → `ORDER_COLLECTION_CODE_LOCKED` until the patient regenerates |
| POST | `/pharmacy/orders/:id/cancel` | OWNER, PHARMACIST | `{ reason }` | → CANCELLED before capture, → REFUND_PENDING after |

`confirm` must be `true` (the pharmacist explicitly certifies the check) – otherwise `400 VALIDATION_FAILED`.

**Pharmacy view**: same commercial fields as the patient view, plus `patient { first_name }`, `delivery_area { wilaya_name_fr/ar, commune_name_fr/ar }` (no street, no phone), `validation_note`, `pharmacist_validated_by`, `next_actions`. No `pharmacy`, no `delivery_address`.

Drivers get `403 ROLE_FORBIDDEN` on all order endpoints (they use `/delivery/jobs/*`).

## 5. Errors

| Code | HTTP | When |
|---|---|---|
| `ORDER_NOT_FOUND` | 404 | not a party to the order |
| `ORDER_INVALID_TRANSITION` | 409 | action not possible in the current status |
| `ORDER_ACTION_FORBIDDEN` | 403 | actor not allowed for this edge |
| `ORDER_VERSION_CONFLICT` | 409 | concurrent change – reload and retry |
| `ORDER_REASON_REQUIRED` | 400 | cancel / failure without reason |
| `ORDER_NOT_CANCELLABLE` | 409 | |
| `ORDER_CANCEL_REQUIRES_APPROVAL` | 409 | patient cancel during preparation |
| `ORDER_ALTERNATIVES_PENDING` | 409 | |
| `ORDER_NOTHING_TO_ORDER` | 422 | |
| `ORDER_OFFER_NOT_AVAILABLE` | 409 | offer no longer SENT / already accepted |
| `ORDER_ITEM_OUT_OF_STOCK` | 409 | |
| `ORDER_DELIVERY_NOT_AVAILABLE` | 422 | |
| `ORDER_COLLECTION_CODE_INVALID` / `_LOCKED` | 400 / 429 | |
| `IDEMPOTENCY_KEY_INVALID` / `_REUSED` / `IDEMPOTENCY_IN_PROGRESS` | 400 / 409 / 409 | |
