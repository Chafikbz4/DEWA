# Phase 6 report – Orders & state machine

## Built
- Design doc first: `docs/06-order-state-machine.md` (Mermaid diagram, transition table with actors / preconditions / side effects / notifications, timeouts, idempotency, role views).
- Pure transition table (`order-state-machine.ts`) for two variants (VALIDATION_FIRST default, PAYMENT_FIRST via `payment_before_validation`), frozen per order.
- `OrderStateMachineService` – the only writer of `orders.status`: edge + actor checks, optimistic lock (`version`), append-only history, side-effect hooks, audit, post-commit events (notifications, realtime).
- Offer acceptance with Idempotency-Key, re-validation (alternatives, policy, delivery, stock), frozen prices, other offers rejected, request OFFER_ACCEPTED.
- Patient & pharmacy endpoints with role-specific views and `next_actions`; pharmacist validation with explicit confirmation; preparation / ready / pickup hand-over with a hashed collection code (5 attempts); cancellation rules per status; localized timeline.
- Timeout jobs: payment deadline, pharmacist validation timeout (+ admin alert), unassigned delivery alert.

## Migration
`0009_order_lifecycle.sql` – `orders.workflow_variant`, `status_changed_at`, `collection_code_hash`, `collection_code_attempts`, `assignment_alerted_at`; `idempotency_keys`.

## Tests
- Unit: `order-state-machine.spec.ts` – exhaustive matrix of all 2 × 15 × 15 × 6 = 2 700 (variant, from, to, actor) combinations against an independent expectation list, terminal states, no cancel after pickup, cancel targets, patient cannot advance fulfillment.
- e2e `test/orders.e2e-spec.ts` (12): accept effects + frozen prices, pending alternatives, **double accept**, **idempotency replay / key reuse / invalid key**, delivery refused, full pickup flow with validation role checks + collection code + Arabic timeline, code lockout + regeneration, pharmacist rejection, **double cancel**, payment-first variant (refund rules, approval required during preparation), payment and validation timeouts, role-filtered views and access.

## Assumptions
1. Owners act as pharmacists for validation (an officine is owned by a licensed pharmacist).
2. Pickup hand-over requires a collection code from the patient (anti-fraud); regenerating it is self-service.
3. A PAYMENT_PENDING order past its deadline is not cancelled by the job – payment reconciliation (Phase 7) decides.
4. Unassigned-delivery alerts are sent once per order.
5. When an order ends CANCELLED/REFUNDED, its request becomes CANCELLED (the patient starts a new request to re-order).

## Open legal question
- Whether payment may be captured before pharmacist validation (`payment_before_validation`). Default is the conservative validation-first flow.
