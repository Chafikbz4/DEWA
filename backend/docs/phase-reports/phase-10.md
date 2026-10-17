# Phase 10 report – Privacy, retention and production hardening

## Built
1. **Data minimisation and role-based serialization.**
   - Layer 0 is the new global `SecretFieldsInterceptor`. It strips hashes, `*_encrypted` columns, MFA secrets, storage keys and raw provider payloads from every response (snake_case and camelCase) and logs the field names, so a presenter that leaks can be fixed.
   - On top of it sit the per-role presenters, `DriverPrivacyInterceptor` (fails closed for delivery actors) and admin metadata-only views with break-glass grants.
   - Every response presenter was reviewed per role; the table is in [10-security-review.md §3](../10-security-review.md).
2. **Retention and deletion.**
   - `RetentionService` runs daily at 03:15 UTC and on demand with `POST /admin/retention/run` (SUPER_ADMIN). Every run is recorded in `data_retention_jobs`, viewable at `GET /admin/retention/jobs`. It:
     - securely deletes prescription and Chifa images whose `retention_until` has passed (unless an order on them is still in progress);
     - erases Chifa insurance numbers;
     - erases OCR raw text and extracted JSON.
   - `POST /me/data-export` returns a JSON download of all the user's personal data (secrets excluded; national ID and Chifa numbers decrypted for the data subject). It can run at most once every 10 minutes and is audited.
   - `POST /me/delete-account` (patients) needs the password and `confirm: true`, and is refused while an order is in progress. It anonymises the account and keeps orders, payments, refunds, receipts, consents and audit logs without contact details. It cancels open requests, purges the user's files, revokes sessions and devices, and means the user can never log in again.
3. **Field-level encryption.** This was already in place: national ID, Chifa number, payout account number, MFA secret, driving licence, OCR text, provider payloads and files, behind a KMS-ready `IKeyProvider` with key ids. New: `npm run crypto:rotate` re-encrypts every encrypted column (and one-time codes in notification payloads) with the current key, and reports files still on older keys.
4. **Observability.**
   - Structured JSON logs (`LOG_FORMAT=json`, `LOG_LEVEL`) or redacted console logs. Redaction covers JWTs, bearer tokens, emails, Algerian and international phone numbers, card or ID numbers, and `password=` / `token=` / `code=` pairs.
   - Access log per request: method, route template, status, duration, request id and user id; never bodies or query strings.
   - `X-Request-Id` tracing, already in place.
   - Probes and metrics:
     - `GET /health/live` (no dependency);
     - `GET /ready` (database plus applied migrations plus job backend);
     - `GET /metrics` (Prometheus text with request counters and latency histograms per route, memory and uptime; requires `Authorization: Bearer $METRICS_TOKEN` and answers 404 when the token is unset).
5. **OWASP review**: [docs/10-security-review.md](../10-security-review.md).
   - Fixed: `Idempotency-Key` was missing from the CORS allow-list, which would have broken `/pay` from browsers.
   - Open before launch: a real malware scanner, the SATIM provider, real messaging providers, KMS plus bulk file re-encryption, a penetration test, restricting `/docs` and `/metrics`, and **upgrading NestJS 10 → 11+** (4 high npm-audit advisories in multer, body-parser, js-yaml and lodash; the CI audit step is non-blocking until then).
6. **Legal readiness**: [docs/11-compliance-open-questions.md](../11-compliance-open-questions.md). Every open legal question is mapped to the flag or feature that stays disabled: eligibility policies, `delivery_enabled`, `payment_before_validation`, `payment_collection_model`, retention placeholders, the mock or unavailable providers, and commission rules.
7. **Tooling.**
   - `npm run db:seed:demo` seeds demo data. It refuses to run in production or without `DEMO_SEED_ALLOW=1`.
   - `npm run demo` runs the HTTP happy-path walkthrough.
   - `npm run docs:openapi` writes `docs/openapi.json` (222 paths, 256 operations) and the Postman collection and environment (Insomnia can import them).
   - CI (`.github/workflows/ci.yml`):
     - quality job: lint (no autofix), prettier check, typecheck, unit tests, build, `npm audit` (high);
     - e2e job: runs against a throw-away PostGIS container with generated secrets, never against Neon.

## Endpoints added
| Method | Path | Access |
|---|---|---|
| POST | /me/data-export | any authenticated user (also while pending) |
| POST | /me/delete-account | PATIENT |
| GET | /admin/retention/jobs | audit.read |
| POST | /admin/retention/run | SUPER_ADMIN |
| GET | /health/live | public |
| GET | /ready | public |
| GET | /metrics | `METRICS_TOKEN` bearer (hidden from Swagger) |

## Configuration
`LOG_FORMAT` (json | pretty), `LOG_LEVEL`, `METRICS_TOKEN`. Existing retention settings: `sensitive_data_retention_days` (365) and `ocr_text_retention_days` (90), both placeholders until legal confirmation.

## Migrations
None: this phase reuses `data_retention_jobs` and `files.retention_until`.

## Tests
- Unit (151 in total):
  - log redaction;
  - the secret-field interceptor, including pagination;
  - the metrics registry;
  - the permission guard.
- e2e `test/privacy.e2e-spec.ts` (4):
  - data export: content, no secrets, rate limit;
  - account deletion:
    - refused while an order is in progress, wrong password, missing confirmation;
    - anonymisation of the user, profile, addresses, files and request notes;
    - the order is kept, sessions are revoked, login is impossible, the deletion is audited;
  - retention purges an expired prescription but keeps one with an active order, erases OCR text, records the job run, and the file returns 404 afterwards;
  - `/health/live`, `/ready`, `/metrics` (404 without a token) and request-id propagation.
- Full e2e regression on the shared stack (secret-field interceptor and access log are active for every suite).

## Not verified
`npm run db:seed:demo` and `npm run demo` were type-checked but **not executed**: the only databases available are the Neon `production` branch (used as the dev database) and the shared `e2e-test` branch, and demo data must not go into either. Run them on a local Docker PostGIS (`docker compose up`) or a dedicated Neon branch.

## Assumptions
1. Deleted accounts keep a placeholder e-mail (`deleted+<id>@deleted.invalid`) to satisfy the email-or-phone constraint. The password hash is replaced by an unusable value.
2. Orders keep their delivery-address snapshot minus phone, street, building and notes. Receipts keep the customer name as a legal accounting record.
3. Files stay readable with old keys while those keys are listed in `ENCRYPTION_KEYS_PREVIOUS`; bulk file re-encryption is an open item.
