# Phase 1 & 2 report – database schema, authentication, RBAC & security

Date: 2026-10-16

## Summary

**Phase 1 – Database**

- 57 tables in Drizzle schema files (`src/database/schema/*.ts`, one file per domain), generated into versioned SQL migrations. No `synchronize`, no `db push`.
- UUID PKs, `timestamptz` UTC, soft delete where specified, money as `bigint` centimes with `CHECK >= 0` and total-consistency checks.
- PostGIS `geography` points + GiST indexes (addresses, pharmacies, drivers), partial unique indexes (one default address, one active order per offer, one enabled policy per category, one active pharmacy per staff user…).
- DB-level safety rules: append-only triggers (audit + history tables), CHIFA `VERIFIED` impossible without an official non-mock source, payment `CONFIRMED` impossible without server-side verification, eligibility policy cannot be enabled without reviewer + legal basis.
- Idempotent seeds: 58 wilayas / 1,541 communes (ar/fr), 7 platform settings, 6 example eligibility policies (all disabled), env-driven super admin.

**Phase 2 – Auth & security**

- Registration for patient / pharmacy owner / delivery company / driver / invited pharmacy staff. Non-patient accounts are never self-activating.
- OTP (6 digits, HMAC-hashed, 5 min, 5 attempts, 60 s cooldown) behind `ISmsProvider` / `IEmailProvider` with console mocks (refused in production).
- Login by password, by SMS code, MFA step; 15-min JWT access tokens checked against a live session; opaque rotating refresh tokens with family-wide revocation on reuse.
- Lockout after 5 failures (15 min), generic errors, timing-equalised unknown-user path, no enumeration on registration / OTP / forgot-password.
- TOTP MFA mandatory for ADMIN/SUPER_ADMIN (no token before MFA), optional for pharmacy staff.
- Device registration + device-bound refresh for biometric login (flag only).
- Guards: JWT (session-checked), account status, roles, pharmacy membership + verification, resource ownership (404 on foreign ids). Per-IP and per-account rate limits on `/auth/*`.
- Consents (grant / list / revoke), staff invitations, minimal admin user management (create admin, list, suspend/activate, change role).
- Unified envelope, ar/fr error translations, helmet, CORS allowlist, input sanitisation, 100 kB body limit, request ids, audit logging.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | public | Liveness + DB |
| POST | `/auth/register/patient` | public | Register patient |
| POST | `/auth/register/pharmacy` | public | Register pharmacy owner + pharmacy |
| POST | `/auth/register/delivery-company` | public | Register delivery company admin + company |
| POST | `/auth/register/driver` | public | Register independent driver |
| POST | `/auth/register/staff` | public (invitation token) | Accept staff invitation |
| POST | `/auth/invitations/preview` | public | Preview an invitation |
| POST | `/auth/otp/request` | public / Bearer for VERIFY_* | Send a code |
| POST | `/auth/otp/verify` | public / Bearer for VERIFY_* | Verify a code |
| POST | `/auth/login` | public | Password login |
| POST | `/auth/login/otp` | public | SMS-code login |
| POST | `/auth/login/mfa` | public (mfa_token) | TOTP step |
| POST | `/auth/refresh` | public (refresh token) | Rotate tokens |
| POST | `/auth/logout` | Bearer | Revoke current session |
| POST | `/auth/logout-all` | Bearer | Revoke all sessions |
| GET | `/auth/sessions` | Bearer | List sessions |
| DELETE | `/auth/sessions/:id` | Bearer (owner) | Revoke a session |
| POST | `/auth/password/forgot` | public | Start reset |
| POST | `/auth/password/reset` | public (reset_token) | Finish reset |
| POST | `/auth/password/change` | Bearer | Change password |
| POST | `/auth/mfa/setup` | Bearer or mfa_token | Start TOTP enrolment |
| POST | `/auth/mfa/enable` | Bearer or mfa_token | Confirm TOTP |
| POST | `/auth/mfa/disable` | Bearer (pharmacy staff) | Disable TOTP |
| POST | `/auth/devices` | Bearer | Register device / biometrics |
| GET | `/auth/devices` | Bearer | List devices |
| DELETE | `/auth/devices/:id` | Bearer (owner) | Remove device |
| GET | `/me` | Bearer | Current account |
| PATCH | `/me` | Bearer | Preferred language |
| GET | `/me/consents` | Bearer | Consent history |
| POST | `/me/consents` | Bearer | Grant consent |
| DELETE | `/me/consents/:type` | Bearer | Revoke consent |
| POST | `/pharmacies/:id/staff/invite` | PHARMACY_OWNER (owner, verified) | Invite staff |
| GET | `/pharmacies/:id/staff/invitations` | PHARMACY_OWNER | List invitations |
| DELETE | `/pharmacies/:id/staff/invitations/:invitationId` | PHARMACY_OWNER | Revoke invitation |
| POST | `/admin/users` | SUPER_ADMIN | Create admin |
| GET | `/admin/users` | ADMIN, SUPER_ADMIN | List users |
| PATCH | `/admin/users/:id/status` | ADMIN, SUPER_ADMIN | Activate / suspend |
| PATCH | `/admin/users/:id/role` | SUPER_ADMIN | Change role |

Swagger: `GET /docs` · OpenAPI JSON: `GET /docs-json`.

## Migrations

| File | Content |
|---|---|
| `drizzle/0000_extensions.sql` | `pgcrypto`, `postgis` |
| `drizzle/0001_initial_schema.sql` | All enums, sequences, 56 tables, FKs, indexes, CHECKs |
| `drizzle/0002_append_only_guards.sql` | Append-only triggers, lat/lng range checks |
| `drizzle/0003_staff_profiles.sql` | `staff_profiles` (names for non-patient accounts) |

## Tests (run before marking done)

- Unit: `npm test` → **9 suites, 63 tests passed** (crypto, password hashing, i18n completeness ar/fr, identifiers, guards, exception filter, sanitiser, OTP service, token service, auth service, consents service).
- e2e: `npm run test:e2e` → **2 suites, 25 tests passed** against the Neon branch `e2e-test` (registration, OTP attempts, login, generic errors, lockout, refresh rotation + reuse detection, device binding, sessions, ownership 404, password reset/change, consents, account-status guard, pharmacy verification guard, staff-role guard, cross-pharmacy denial, staff invitation acceptance, admin MFA enforcement, admin suspend/role rules, audit rows).

## Deviations from the brief / additions (please review)

| Item | What & why |
|---|---|
| ORM | Drizzle (schema-as-code "entities" + generated SQL migrations) instead of TypeORM – already set up, Neon-recommended, no `synchronize`. |
| `staff_profiles` table | Added: the brief stored names only for patients and drivers; pharmacy staff / delivery admins / admins need names. |
| `pharmacy_staff_invitations` table | Added for Phase 2 invitations (token stored as HMAC). |
| `sessions.family_id`, `revoke_reason`, `last_used_at` | Needed for rotation, reuse detection and the sessions list. |
| `devices.device_identifier`, `biometric_enabled`, `revoked_at` | Needed for device-bound refresh / biometrics. |
| `users.password_changed_at` | Makes reset tokens single-use. |
| `otp_codes.target_type`, purpose `VERIFY_EMAIL` | Email verification alongside phone. |
| `delivery_companies.admin_user_id` | Links the company to its admin account. |
| `delivery_company_doc_type` enum | Company-specific document types (brief said "same pattern as pharmacy"). |
| `delivery_fee_rules.min_fee_centimes` / `max_fee_centimes` | Renamed from `min_fee` / `max_fee` for the centimes convention. |
| Money type | `bigint` (read as JS number) instead of `integer` – settlement totals can exceed 21 M DZD. |
| `orders.offer_id` | Partial unique index on *active* orders instead of a plain unique, so a cancelled/failed order does not block re-ordering the same offer. |
| `commission_rules.value` | PERCENT in basis points (500 = 5 %), FIXED/SUBSCRIPTION in centimes. |
| Unique email/phone | Partial unique (`WHERE deleted_at IS NULL`) so soft-deleted accounts don't block re-use. |
| Admin endpoints | Minimal `/admin/users` added (needed to activate staff and to test audit/role changes). Full admin back-office comes in a later phase. |
| `/health`, Hello-World root | Health moved under `modules/`, scaffold root route removed. |

## Assumptions

1. Patients self-activate after verifying their phone/email. Every other role (pharmacy owner, pharmacist, assistant, delivery admin, driver) stays `PENDING_VERIFICATION` until an admin approves (admin approval endpoints = later phase; for now `PATCH /admin/users/:id/status`).
2. Invited pharmacy staff are also `PENDING_VERIFICATION` (license to be checked by an admin), even though the owner vouched for them.
3. Admins created by a super admin become `ACTIVE` when they enrol TOTP; the initial password is set by the super admin and communicated out-of-band.
4. New pharmacies start in `DRAFT`; submitting documents for review (`PENDING_VERIFICATION`) is a later phase.
5. OTP login is phone-only (as specified); email OTP is used for registration/reset/verification.
6. Rate limits use in-memory storage unless `REDIS_URL` is set (required for multi-instance deployments).
7. TOTP codes can be replayed within their 30-s window (no last-used-step tracking yet) – mitigated by the lockout and rate limits.
8. Two parallel refreshes with the same token are treated as reuse (strict). The frontend must serialize refreshes.
9. Platform settings defaults (24 h request expiry, 12 h offer validity, 30 min payment deadline, max 5 pharmacies, delivery disabled, 365-day retention) are placeholders.
10. Geography seed: the 58 wilayas / 1,541 communes from the public `othmanus/algeria-cities` dataset. Newer administrative reforms (additional wilayas) are not included.
11. `TRUNCATE` on append-only tables is not blocked by triggers; production must use a DB role without TRUNCATE/DELETE on those tables.

## Open legal / regulatory questions (not decided – need counsel)

1. **Online sale & delivery of medicines in Algeria**: is it permitted for OTC and/or prescription medicines, under which conditions (Law 18-11 on health, pharmacy regulations)? All eligibility policies are seeded **disabled** until a documented legal basis exists.
2. **Prescription originals**: is a scanned prescription sufficient, or must the original be presented at hand-over? (`requires_original_prescription` exists per policy and per offer.)
3. **Health data hosting**: Law 18-07 (personal data protection) – does health data need to be hosted in Algeria and declared/authorised by the ANPDP? Neon currently runs in `us-east-2` (AWS). **This is likely blocking for production with real patient data.**
4. **Retention periods** for prescriptions, CHIFA images, audit logs (`sensitive_data_retention_days` = 365 is a placeholder).
5. **Consent texts** (TERMS, PRIVACY, HEALTH_DATA_PROCESSING, SHARE_PRESCRIPTION_WITH_PHARMACY) and their versions must be written/validated; the API only stores version strings.
6. **CNAS / CHIFA**: no official verification API is integrated or claimed; status can never be `VERIFIED` without one (DB-enforced).
7. **Edahabia / SATIM**: no integration exists yet (later phase, mock provider first); merchant/acquirer agreements required.
8. **Commission model**: is a percentage commission on medicine sales allowed for a platform, or only fixed/subscription fees? Rules are stored with `legal_review_note`, inactive by default.
9. **Pharmacist validation**: which categories legally require pharmacist validation before payment/delivery (`payment_before_validation` = false by default).
10. **Dependants**: proof of authorisation for ordering on behalf of others (children, parents).

## Operational notes

- Development currently uses the Neon **production** branch (nothing is live). Recommended next step: create a `development` branch for day-to-day work and keep `production` for deployments.
- Docker Compose file provided (api + postgis + redis) but **not run here** (Docker is not installed on this machine).
- Machine Node.js is 20.17; several tools require ≥ 20.19 / 22. Upgrade to Node 22 LTS recommended (the Docker image already uses Node 22).
