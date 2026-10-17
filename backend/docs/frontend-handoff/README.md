# DEWA API – frontend handoff

Everything a mobile or web developer needs to build the four DEWA clients against this API.

| File | Contents |
|---|---|
| [README.md](./README.md) (this file) | Base URL, auth and token refresh, headers, envelope, errors, files, idempotency, realtime basics |
| [patient.md](./patient.md) · [pharmacy.md](./pharmacy.md) · [delivery.md](./delivery.md) · [admin.md](./admin.md) | Screens per app, the endpoints each screen calls, and links to the exact field tables |
| [statuses.md](./statuses.md) | Request / offer / order / payment / delivery statuses with ar/fr labels and user-facing meaning *(generated)* |
| [errors.md](./errors.md) | Every error code: HTTP status, i18n key, fr/ar message, suggested UX action *(generated)* |
| [realtime.md](./realtime.md) | Socket.IO events catalogue |
| [curl/](./curl/) | A cURL example for **every** endpoint *(generated)* |
| [walkthrough.md](./walkthrough.md) | End-to-end happy path: register → prescription → offer → accept → pay → prepare → delivery → receipt |
| [claude-code-prompt.md](./claude-code-prompt.md) | Prompt to paste into Claude Code to generate the TypeScript API client |
| [`../openapi.json`](../openapi.json) | The OpenAPI 3 contract (source of truth for schemas) |
| [`../postman/`](../postman/) | Postman / Insomnia collection and environment |

The per-domain references in [`../api/`](../api/) hold the exact request and response field tables. The screen files link to the relevant section.

Regenerate the generated parts after any API change:
```bash
npm run docs:openapi   # docs/openapi.json + Postman collection
npm run docs:handoff   # errors.md, statuses.md, curl/*.md
```

## 1. Base URL and environments

| Environment | Base URL | Notes |
|---|---|---|
| Local | `http://localhost:3000` | `npm run start:dev`; Swagger UI at `/docs`, raw JSON at `/docs-json` |
| Staging / production | to be provided | HTTPS only |

There is no global prefix and no version segment yet. Breaking changes will add `/v2`. Times are **UTC ISO-8601**; display them in `Africa/Algiers`. Money is **integer centimes of DZD** (`85000` = 850,00 DA): never use floats, and format on the client.

## 2. Headers

| Header | When | Value |
|---|---|---|
| `Authorization` | every authenticated call | `Bearer <access_token>` |
| `Accept-Language` | every call | `ar` or `fr` (default `fr`). Localizes `error.message`, timeline labels and notification texts |
| `Content-Type` | JSON bodies | `application/json` (uploads: `multipart/form-data`) |
| `Idempotency-Key` | **required** on `POST /orders/:id/pay`; recommended on `POST /offers/:id/accept` | A fresh UUID v4 **per user action**, reused for retries of that same action |
| `X-Request-Id` | optional | Your own trace id (8–64 chars `[A-Za-z0-9_-]`). Echoed back, and returned in `meta.request_id` |
| `X-Device-Id` | mobile apps | Stable random id generated at first launch (needed for biometric / device-bound sessions) |

CORS allows `Authorization, Content-Type, Accept-Language, X-Request-Id, X-Device-Id, Idempotency-Key` from the configured origins.

## 3. Authentication and token refresh

The full guide is [../api/02-auth.md](../api/02-auth.md).

1. **Register.** Use `POST /auth/register/patient` (patients), `/pharmacies/register`, `/delivery/register` or `/auth/register/staff` (invitation). This returns `202` and sends an OTP. Then call `POST /auth/otp/verify` with the code.
2. **Log in.** `POST /auth/login { identifier, password }` → `{ access_token, refresh_token, user }`. Variants:
   - phone + SMS code: `/auth/login/otp`;
   - **admins and pharmacy staff with MFA**: the response holds an `mfa_token` instead of tokens; then call `POST /auth/login/mfa { mfa_token, code }`. Admins must enrol TOTP on first login (`/auth/mfa/setup` → `/auth/mfa/enable`).
3. **Tokens.**

| Token | Lifetime | Store |
|---|---|---|
| `access_token` (JWT) | 15 min | memory |
| `refresh_token` | 30 days, **single use** | iOS Keychain / Android Keystore; web: memory or an httpOnly-cookie proxy, **never localStorage** |

4. **Refresh algorithm.**
   - On `401` with `error.code = AUTH_TOKEN_EXPIRED`, call `POST /auth/refresh { refresh_token, device_id? }` **once**, store the **new** pair, and retry the original request.
   - Serialise refreshes: only one may be in flight. Queue the other requests behind it. Two parallel refreshes with the same token count as **reuse**: the server revokes the session family and you get `AUTH_REFRESH_REUSED`.
   - Any other 401 code (`AUTH_SESSION_REVOKED`, `AUTH_REFRESH_INVALID`, `AUTH_TOKEN_INVALID`, …) means the session is over: clear the tokens and show the login screen.
5. **Account status.** Pharmacy staff, drivers and company admins stay `PENDING_VERIFICATION` until an admin approves them. Only onboarding endpoints work in that state; others return `403 ACCOUNT_PENDING_VERIFICATION`.
6. **Logout.** `POST /auth/logout` (this session) or `/auth/logout-all`.
7. **Privacy.** `POST /me/data-export` (JSON download) and `POST /me/delete-account { password, confirm: true }` (patients).

## 4. Response envelope

```jsonc
// success
{ "success": true, "data": { … } | [ … ], "error": null,
  "meta": { "request_id": "…", "pagination": { "page": 1, "limit": 20, "total": 57, "total_pages": 3 } } }
// error
{ "success": false, "data": null,
  "error": { "code": "ORDER_INVALID_TRANSITION", "message_key": "errors.ORDER_INVALID_TRANSITION",
             "message": "Action impossible dans l'état actuel de la commande.", "details": { "from": "PREPARING", "to": "CANCELLED" } },
  "meta": { "request_id": "…" } }
```

- **Lists** accept `page`, `limit` (≤ 100) and `order=asc|desc`, plus domain filters, and return `meta.pagination`. Some lists add counters to `meta` (for example `unread_count`).
- **Validation errors** come back as `400 VALIDATION_FAILED` with `details: [{ field, constraints[], message_key }]`. Map `field` to the form input.
- **Binary responses** have no envelope: receipt PDF (`?format=pdf`), data export, audit CSV, file downloads.

## 5. Errors

Branch on `error.code`, which is stable, and display `error.message`, which is already localized. The full catalogue with a suggested UX action per code is in [errors.md](./errors.md). General rules:

| HTTP | Meaning | Default UX |
|---|---|---|
| 400 | Invalid input | Show field errors |
| 401 | Not authenticated | Refresh once if `AUTH_TOKEN_EXPIRED`, otherwise log out |
| 403 | Not allowed (role, permission, account status) | Hide or disable the action |
| 404 | Missing **or not yours** (ids cannot be probed) | “No longer available”, go back |
| 409 | State changed or conflict | Refetch and re-render |
| 422 | Business rule (delivery not available, zone not covered…) | Explain and offer an alternative |
| 429 | Rate limited / locked code | Back off; `details` may give a delay |
| 5xx / 502 | Server or provider error | Generic message with `meta.request_id` and retry |

## 6. Files

- Upload with `POST /files/upload` (multipart `purpose` + `files[]`, ≤ 10 MB × 5). The type is detected from the content (JPEG / PNG / WebP / PDF). The response gives file ids to attach elsewhere (requests, documents, chat, proof of delivery).
- Read with `GET /files/:id/access-url`, which returns a short-lived signed URL (5 min, bound to the user). Open it directly and never cache it. Files you are not allowed to see return `404`.
- Upload purposes per role:

| Role | Purposes |
|---|---|
| Patient | `PRESCRIPTION`, `CHIFA_CARD`, `DEPENDANT_PROOF`, `MESSAGE_ATTACHMENT` |
| Pharmacy owner / pharmacist | `PHARMACY_DOC`, `MESSAGE_ATTACHMENT` |
| Pharmacy assistant | `MESSAGE_ATTACHMENT` |
| Driver | `DRIVER_DOC`, `PROOF_OF_DELIVERY` |
| Delivery company | `DELIVERY_COMPANY_DOC` |

## 7. Idempotency and double taps

- `POST /orders/:id/pay` **requires** `Idempotency-Key`. Generate the UUID when the user taps “Pay” and reuse it for network retries. A second tap with the same key returns the same payment. A different key while a payment is pending returns `409 PAYMENT_ALREADY_IN_PROGRESS`.
- Replays return the original response. Reusing a key with a different body returns `409 IDEMPOTENCY_KEY_REUSED`. A request still in progress returns `409 IDEMPOTENCY_IN_PROGRESS`: retry shortly with the same key.

## 8. Payments in the app

1. `GET /orders/:id/checkout` shows the transparent breakdown.
2. `POST /orders/:id/pay` (with Idempotency-Key) returns `redirect_url`. Open it in an in-app browser / webview.
3. After the redirect, **poll `GET /payments/:id/status` every 2–3 s** until `CONFIRMED` or `FAILED`, or until the payment deadline. Only show success on `CONFIRMED`: the server verified it with the bank. The browser return page is informational only.
4. `GET /orders/:id/receipt` returns the receipt (`?format=pdf` for the PDF).

In development the provider is a mock. Simulate the bank with `POST /payments/mock/:providerOrderId/simulate { "result": "PAID" }`; the provider order id is the last path segment of `redirect_url`.

## 9. Realtime

Socket.IO namespace `/realtime`, connected with `auth: { token: <access_token> }`. Reconnect with a fresh token after a refresh. Events carry ids and statuses: refetch the resource with REST after each event. The catalogue is in [realtime.md](./realtime.md).

## 10. Things the clients must never do

- Send prices, totals or amounts the server should compute: every amount comes from the server.
- Treat a payment as successful before `GET /payments/:id/status` says `CONFIRMED`.
- Show medicine names in push or lock-screen previews. The API never puts them in notifications; keep it that way in local notifications too.
- Cache signed file URLs, store tokens in web `localStorage`, or log tokens, codes or patient data.
