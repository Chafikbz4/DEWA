# 11 – Compliance: open questions before launch

**Nothing in this backend is a legal approval.** Every item below needs written confirmation from legal counsel or the competent authority: the Ministry of Health (MSPRH), the Ordre des pharmaciens, CNAS, ANPDP, the Bank of Algeria / SATIM, or the Ministry of Commerce. Each item is mapped to the configuration flag or feature that **stays disabled or on a placeholder until it is resolved**.

Platform settings are edited at `PATCH /admin/settings/:key` (SUPER_ADMIN, change history kept). Eligibility policies are edited at `PATCH /admin/eligibility-policies/:id`, where a `legal_basis_reference` is required to enable one.

## 1. Online medicine requests and sales

| Question | Why it matters | Flag / feature (default) |
|---|---|---|
| Is it lawful for a platform to relay prescription requests to licensed pharmacies and display their offers (intermediation vs. "vente en ligne de médicaments")? | Core activity of DEWA | `eligibility_policies.is_enabled = false` for every category; online requests need `allowed_online_request` + `legal_basis_reference` |
| Which categories may be requested online: OTC, prescription-only, COLD_CHAIN, CONTROLLED, PSYCHOTROPIC? | Some are probably excluded | One policy per category; CONTROLLED and PSYCHOTROPIC cannot be enabled without a legal basis and always require pharmacist validation |
| Is a scanned or photographed prescription legally sufficient, or must the original be presented at hand-over? | Fulfilment flow | `requires_original_prescription` per policy; the offer field `requires_prescription_original` |
| Must the pharmacist validate before payment, or may payment be captured first? | Order workflow | `payment_before_validation = false` (validation first) |
| May pharmacies show prices online, and are medicine prices regulated (PPA / reimbursement tariff)? | Offers show prices | Prices are entered by pharmacies; no price check yet |

## 2. Prescriptions and health data (Law 18-07 on personal data, health secrecy)

| Question | Flag / feature (default) |
|---|---|
| Does processing health data require prior authorisation or declaration to ANPDP? Must data be hosted in Algeria? | Hosting on Neon (US region) is **for development only**; migrating to a compliant host is a launch blocker |
| How long may prescriptions, Chifa images and OCR text be kept? | `sensitive_data_retention_days = 365` and `ocr_text_retention_days = 90` are **placeholders**; daily secure deletion runs (`data_retention_jobs`) |
| Is OCR of prescriptions permitted, and with which processor? | `ocr_enabled = true` with a local mock OCR; a real OCR provider needs a processing agreement |
| Is the per-request consent wording sufficient (sharing with the selected pharmacies only)? Which TERMS / PRIVACY versions apply? | `consent_to_share` is required per request; consent records are versioned |
| May platform admins access prescription content (support / disputes), and under which conditions? | Break-glass grants (30 minutes, justification, logged); `sensitive_access_grant_minutes = 30` |
| Data subject rights: format and delay for access/export and deletion; which records must be kept and for how long (orders, invoices, payments)? | `POST /me/data-export` and `POST /me/delete-account` (anonymisation; orders, payments, receipts and consents kept) |
| How long must audit logs and sensitive-access logs be kept? | No automatic deletion of logs yet |

## 3. CNAS / Chifa

| Question | Flag / feature (default) |
|---|---|
| Is there an official API or agreement to verify Chifa coverage? Under which conditions may a private platform query it? | **No CNAS integration exists.** The verification provider interface (`ICnasVerificationProvider`) is bound to `UnavailableCnasProvider`, so the status stays `NOT_VERIFIED` unless a pharmacist checks the card in person |
| May the Chifa number be stored? For how long, and may it be shown to pharmacies or admins? | Stored encrypted and shown masked; erased with the retention job |
| Does third-party payment (tiers payant) apply to online orders? | Not implemented; totals are full price |

## 4. Payments (Edahabia / CIB via SATIM)

| Question | Flag / feature (default) |
|---|---|
| Merchant model: may the platform collect for pharmacies (marketplace) or must each pharmacy have its own merchant account? Is a payment-institution status or a bank agreement required? | `payment_collection_model = MARKETPLACE` (placeholder); **settlements are records only**, with no payout API |
| SATIM / Edahabia merchant contract and official integration kit (endpoints, signature, test environment, refunds) | `PAYMENT_PROVIDER=mock`; the SATIM provider is a skeleton that throws until implemented |
| May online payment be used for prescription medicines? | `allowed_online_payment` per eligibility policy |
| May a platform service fee be charged on medicines? | `service_fee_centimes = 0` |
| Platform commissions on pharmacy sales: are they allowed, and how are they invoiced and taxed (VAT)? | Commission rules are created disabled and need a `legal_review_note` to activate |
| Is the platform receipt sufficient, or is a pharmacy fiscal invoice required for each sale? | The receipt says it is a platform payment receipt, not a fiscal invoice |

## 5. Delivery

| Question | Flag / feature (default) |
|---|---|
| May medicines be delivered at home, and which categories (excluding CONTROLLED, PSYCHOTROPIC, COLD_CHAIN)? Who may carry them (pharmacy staff only, approved couriers)? | `delivery_enabled = false`; `allowed_delivery = false` per policy |
| Rules for cold-chain transport and for identity checks at hand-over | COLD_CHAIN has no policy enabled; proof options are OTP, signature or a photo without faces |
| Status and contracts of delivery companies and independent drivers; liability for loss or damage | Verification flow only; payouts are records only |
| Are signature or photo proofs acceptable for prescription medicines, or is the OTP mandatory? | All three proofs are accepted today; making the OTP mandatory is a small change |
| How long may driver location data be kept? | Only the last position is stored; no location history |

## 6. Consumer protection, refunds and complaints

| Question | Flag / feature (default) |
|---|---|
| Right of withdrawal for medicines, and refund rules after hand-over | Refunds always need admin approval; automatic full refund only when the order is cancelled after payment or the delivery fails |
| Mandatory pre-contract information, general terms of sale, mediator / complaint channel | Complaint module exists; legal texts are to be written |
| Pharmacy service areas and on-duty (garde) obligations | `matching_only_open_pharmacies = true`; on-duty data is entered manually |

## 7. Professional and platform obligations

| Question | Flag / feature (default) |
|---|---|
| Which documents prove a pharmacy's authorisation, and how are licences checked (Ordre des pharmaciens registry)? | Manual verification queue; no registry API |
| Advertising restrictions for medicines (search ranking, promotions) | No promotion features; matching is by distance and availability only |
| Chat between patients and pharmacists: allowed scope (advice vs. teleconsultation) | Messages are limited to clarifications; phone numbers are blocked; no teleconsultation |

## Launch checklist (technical items tied to the answers above)

1. Choose a compliant hosting provider and data location, and migrate.
2. Enable the eligibility policies one by one with `legal_basis_reference` filled in.
3. Set the confirmed retention periods.
4. Implement SATIM/Edahabia; set `PAYMENT_PROVIDER=satim`; decide `payment_collection_model`.
5. Plug in real SMS, e-mail, push, OCR and malware-scanner providers under the appropriate contracts.
6. Publish the TERMS / PRIVACY versions and update the consent versions.
7. Enable delivery (`delivery_enabled`) only for the approved categories and zones.
