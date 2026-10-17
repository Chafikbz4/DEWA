# 10 – Security review (OWASP-oriented)

Scope: DEWA backend (NestJS, PostgreSQL / Neon, local or S3 storage, Socket.IO). Review date: 2026-10. References: OWASP API Security Top 10 (2023) and the OWASP ASVS L2 controls relevant to an API.

Status legend: **OK** = control in place and tested · **FIXED** = issue found during this review and corrected · **OPEN** = must be addressed before launch · **ACCEPTED** = residual risk, documented.

## 1. Broken object-level authorization (IDOR) – OK

- Every resource is loaded and then checked against the caller:
  - patients: `patient_user_id`;
  - pharmacies: `PharmacyAccessGuard` + `@CurrentPharmacy()`, and the services compare `pharmacy_id`;
  - drivers: `driver_id` (a job is visible only to its assigned driver);
  - companies: `admin_user_id`;
  - admins: permission + grant.
- A failed check returns **404 with the same code as "not found"** (`ORDER_NOT_FOUND`, `DELIVERY_NOT_FOUND`, `FILE_NOT_FOUND`), so ids cannot be probed.
- Files are served only through `FileAccessService` rules:
  - owner;
  - pharmacy recipient while the patient's consent is active (assistants excluded);
  - conversation participant;
  - delivery-proof parties;
  - admins with `verification.read` (verification documents) or with an active sensitive grant (prescription, Chifa, chat attachments).
  Signed download URLs are bound to the user and expire after 300 s.
- Tests cover cross-patient, cross-pharmacy, assistant and driver access (rbac, patient, pharmacy, orders, delivery and admin suites).

## 2. Broken authentication – OK

- Passwords use argon2id (`@node-rs/argon2`) with a strength policy. Lockout follows `LOGIN_MAX_FAILED_ATTEMPTS` and `LOGIN_LOCKOUT_MINUTES`, and authentication responses are generic so accounts cannot be enumerated.
- Tokens:
  - JWTs use **HS256 pinned** on sign and verify (`algorithms: ['HS256']`, so `alg=none` and algorithm confusion are rejected), with a 15-minute access TTL;
  - every request checks the **session** in the database, so revoked sessions stop immediately;
  - refresh tokens rotate, and reuse revokes the whole session family.
- Admins: TOTP is mandatory, and the guard re-checks MFA (`ADMIN_MFA_REQUIRED`).
- OTPs are hashed, have limited attempts and a resend cooldown. Rate limits: global, `/auth` per IP, and `/auth` per targeted account (Redis store when `REDIS_URL` is set).
- **ACCEPTED**: HS256 means every service that verifies tokens holds the signing secret. Move to an asymmetric algorithm (EdDSA / RS256 with a JWKS) if other services ever need to verify tokens.

## 3. Broken object property level authorization / mass assignment – OK

- A global `ValidationPipe` runs with `whitelist + forbidNonWhitelisted + transform`, so unknown fields are refused (400). DTOs list every accepted field, and services map them explicitly to columns.
- Fields locked after verification, such as pharmacy legal fields, are enforced in the services.
- Role-based serialization:
  - **layer 0** – the new global `SecretFieldsInterceptor` strips hashes, `*_encrypted` columns, MFA secrets, storage keys and raw provider payloads from **every** response and logs the leak;
  - **layer 1** – a presenter per role (patient view, pharmacy view, delivery-area-only view, admin metadata view);
  - **layer 2** – `DriverPrivacyInterceptor` fails closed for delivery actors;
  - **layer 3** – admins see request and order metadata only; content needs a time-limited sensitive grant.
- Data-minimisation review of the response presenters:

| Audience | Never receives |
|---|---|
| Pharmacy staff | Patient national ID, Chifa number (masked), full delivery address before acceptance (area only), other pharmacies' offers |
| Pharmacy assistant | Prescription and Chifa files |
| Driver / company | Prescription files, medicine names, items, Chifa data, national ID, date of birth |
| Patient | Internal complaint notes, other patients' data, pharmacy payout data |
| Admin (no grant) | Prescription items and files, patient notes, Chifa data, messages |

## 4. Unrestricted resource consumption – OK

- JSON body limit is 100 kB. Uploads are capped at 10 MB × 5 files; CSV imports at 2 MB (stock) and 5 MB (catalogue) with line caps.
- Lists are paginated (max 100 per page). Analytics ranges are capped at 366 days and audit exports at 10 000 rows.
- Rate limiting applies globally plus to `/auth`, messages (`message_rate_limit_per_minute`), location updates and data exports.

## 5. Broken function level authorization – OK

- The global guard chain runs in this order: throttle → JWT + session → account status → roles → **permissions**.
- Admin endpoints declare `@RequirePermissions(...)` or `@RequireSuperAdmin()`. An e2e test checks **52 endpoints × 6 admin profiles** against the default matrix.

## 6. Injection – OK

- All database access goes through Drizzle with bound parameters. Raw SQL uses tagged `sql` templates, which also bind parameters, and **no `sql.raw` is used anywhere**.
- `LIKE` patterns escape `%`, `_` and `\`.
- `SanitizePipe` strips control characters and trims string inputs. Output is JSON only (no server-side HTML), so stored text is not rendered by the API; clients must escape it when displaying. Chat messages reject phone numbers and blocked words.
- CSV export **neutralises spreadsheet formulas** (`=`, `+`, `-`, `@` are prefixed) and quotes every cell.
- PDF receipts are generated from data, not templates, so there is no template injection.

## 7. SSRF in file / URL handling – OK

- The API never fetches a URL supplied by a client. Storage endpoints (`S3_ENDPOINT`), the payment gateway base URL and `PUBLIC_BASE_URL` come only from validated environment variables.
- Uploads are multipart bytes only; there is no "upload from URL".
- The payment `redirect_url` is generated by the server from the provider response; return URLs are built from `PUBLIC_BASE_URL`.

## 8. File upload abuse – OK, with one OPEN item

- The type is detected from **magic bytes** (JPEG, PNG, WebP, PDF), and the client MIME type and extension are ignored.
- Upload purposes are restricted per role. Size and count limits apply, and file names are sanitised.
- Files are **encrypted at rest** (AES-256-GCM, key id stored for rotation). Downloads go through short-lived signed URLs with `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`.
- **OPEN**: `MockMalwareScanner` is the active scanner. Plug a real scanner (for example a ClamAV daemon) behind `IMalwareScanner` before launch.

## 9. Webhook spoofing / payment integrity – OK

- Every webhook is stored first, then its HMAC signature is checked with a timing-safe compare over the raw body (kept only for `/payments/webhook/*`). The unique `provider_event_id` blocks replays.
- **The webhook body never confirms a payment.** `verifyAndApply` asks the provider server-to-server and compares the captured amount with the order amount. A DB CHECK enforces `CONFIRMED ⇒ verified_server_side_at`.
- Amounts always come from the order. `Idempotency-Key` is required on `/pay`. Raw provider payloads are encrypted; no PAN, PIN or CVV ever reaches DEWA.
- The mock gateway endpoints are disabled when `NODE_ENV=production` or another provider is selected. The mock webhook secret is random per process when not configured, so there is no default secret in the code.
- **OPEN**: the SATIM/Edahabia provider is a skeleton. Its signature and status checks must be implemented from the official merchant kit, then security-tested.

## 10. Security misconfiguration – OK, FIXED

- `helmet`, CORS allow-list (`CORS_ORIGINS`), `x-powered-by` disabled, `trust proxy` opt-in. The environment schema is validated at boot, and production refuses weak or missing secrets.
- **FIXED**: the CORS `allowedHeaders` list did not include `Idempotency-Key`, so browser clients would have failed preflight on `/orders/:id/pay` and offer acceptance. The header is now allowed.
- Swagger stays enabled in production for the API consumers; restrict `/docs` at the reverse proxy if the API is not public.

## 11. Sensitive data exposure and logging – OK

- Field-level encryption with a key provider (`IKeyProvider`, KMS-ready) and key ids, covering:
  - the national ID;
  - Chifa insurance numbers;
  - payout account numbers;
  - MFA secrets;
  - the driving licence number;
  - OCR raw text;
  - raw provider payloads;
  - file contents.
  `npm run crypto:rotate` re-encrypts every encrypted column with the current key. File objects keep their key id and stay readable while the old key is listed in `ENCRYPTION_KEYS_PREVIOUS`; bulk re-encryption of stored files is still to do (open item 4).
- Logs:
  - logs are structured JSON (`LOG_FORMAT=json`) with **redaction** of JWTs, bearer tokens, emails, phone numbers, long numbers (cards, IDs) and `password=` / `token=` / `code=` pairs;
  - access logs record method, route template, status, duration, request id and user id — never bodies or query strings;
  - the exception filter logs codes and request ids, not payloads.
- Notification texts carry references only. Templates are validated so they can never add a medicine name.
- Admin access to content is break-glass: a justified grant valid for 30 minutes, every read logged in `sensitive_access_logs`.

## 12. Insufficient logging and monitoring – OK

- The audit log records authentication events, admin actions (with reasons and before/after values), sensitive reads, exports and settings changes. It can be exported to CSV.
- `/admin/security-events` reports failed logins, lockouts, refresh-token reuse and suspicious IPs.
- Monitoring endpoints:
  - `/metrics` (Prometheus format, token-protected): requests, latency histogram, memory, uptime;
  - `/health/live` and `/ready`.

## 13. Realtime (Socket.IO) – OK

- The handshake requires an access token and the session is checked. Clients only join rooms derived on the server (their user id, their pharmacy). Revoked sessions are disconnected.
- Events carry ids and statuses only.

## Open items before launch

| # | Item | Owner |
|---|---|---|
| 1 | Replace `MockMalwareScanner` with a real scanner | DevOps |
| 2 | Implement and test the SATIM/Edahabia provider from the official kit | Backend + payment provider |
| 3 | Real SMS / e-mail / push providers (console providers today) | DevOps |
| 4 | Put the encryption key in a KMS or HSM (`IKeyProvider`), define the rotation schedule, and add bulk re-encryption of stored files | DevOps / security |
| 5 | External penetration test, including the mobile apps | Security |
| 6 | Restrict `/docs` and `/metrics` at the reverse proxy; set `METRICS_TOKEN` | DevOps |
| 7 | Clean up the test data written to the Neon `production` branch during development (awaiting the owner's decision) | Owner |
| 8 | **Upgrade NestJS 10 → 11+.** `npm audit --omit=dev` (2026-10) reports 4 high advisories in transitive dependencies: `multer` (upload DoS / size-limit bypass) and `body-parser` via `@nestjs/platform-express`, and `js-yaml` / `lodash` via `@nestjs/swagger`. All fixes are major upgrades. The CI audit step is non-blocking until this is done | Backend |
