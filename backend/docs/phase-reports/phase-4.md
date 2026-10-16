# Phase 4 report – Pharmacy domain

## Built
- Registration (`POST /pharmacies/register`, pharmacy + owner in PENDING_VERIFICATION), verification status, document upload/removal, (re)submission after rejection; verification guard on every pharmacy feature (matching, inbox, offers, stock, orders).
- Profile (legal fields locked once VERIFIED), opening hours (Algiers time, overnight ranges), on-duty periods, service areas, payout accounts (encrypted, always masked), staff management (role change / deactivation with immediate session revocation).
- Catalog search (fr / ar / DCI with pg_trgm typo tolerance), stock CRUD, CSV import with dry run and line-level validation report.
- Request inbox with sensitive-access logging and view tracking; accept-interest (explicitly not a dispensing authorization), decline, clarification (opens the conversation, request → CLARIFICATION_REQUIRED); average response time.
- Offers: server-side totals, delivery fee from zone rules (PostGIS distance), service fee setting, policy blocking of restricted items, substitutions restricted to OWNER/PHARMACIST with explicit per-item patient approval, send / withdraw / expiry job, patient list / detail / compare.
- Complaints (patients, drivers, staff) and pharmacy view/reply; reports summary; settlements list.

## Migrations
- `0005_pg_trgm.sql` – pg_trgm extension.
- `0006_pharmacy_domain.sql` – recipient status `INTERESTED`, `medicines.name_ar` + trigram indexes, `offers.created_by_user_id` / `withdrawn_at`, `pharmacies.submitted_for_review_at`.
- `0007_offer_item_position.sql` – stable line order in offers.

## Tests
`test/pharmacy.e2e-spec.ts` (14): registration + verification guard (pending account, unverified pharmacy, document workflow), role matrix (profile, staff, decline, substitutions), staff license rule + deactivation revoking sessions, inbox viewed + sensitive access logs + no street + prescription gating, interest ≠ offer, clarification state + conversation, decline, server-side price computation (forged totals rejected), delivery fee from zone rules, restricted items blocked, compare + alternative approval + offer ownership, catalog search + stock + CSV import report, hours / on-duty / masked payouts, complaints, reports.

## Assumptions
1. A staff user belongs to one active pharmacy, so `/pharmacy/*` resolves the pharmacy from the user.
2. Required verification documents: AUTHORIZATION, PHARMACIST_DIPLOMA, ID (list to confirm with the regulator).
3. Assistants may prepare and send offers, but never substitutions, never decline, never ask clarifications, never see prescription images.
4. OWNERS are treated as pharmacists (in Algeria an officine is owned by a licensed pharmacist) – they may validate, substitute and read prescriptions.
5. Offer validity defaults to 12 h; a pharmacy has at most one active (DRAFT/SENT) offer per request.
6. The service fee is 0 until the commercial/legal model allows one.
7. Order fulfillment endpoints (validate / prepare / ready / handover) are delivered with the order state machine in Phase 6.

## Open legal questions
- Which documents are legally required to verify an officine and its pharmacists.
- Whether substitution (generic for brand) may be proposed remotely and what consent is needed.
- Whether delivery fees may be set by the pharmacy, the platform, or must be regulated.
- Stock/price display: whether public price display of prescription medicines is allowed.
