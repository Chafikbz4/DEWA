# Prompt for Claude Code – generate the DEWA API client

Copy everything inside the block below into Claude Code, opened at the root of your frontend repository. Put `openapi.json` (from `backend/docs/openapi.json`) and this `frontend-handoff/` folder in the repository first, for example under `docs/api/`.

````text
You are generating the typed API layer of a DEWA client app (Algerian pharmacy marketplace, Arabic/French).
Source of truth: ./docs/api/openapi.json (OpenAPI 3). Behaviour rules: ./docs/api/frontend-handoff/README.md,
errors.md, statuses.md, realtime.md. Read them before writing code.

Goal: a TypeScript package `src/api/` with:
1. Types generated from the OpenAPI document with `openapi-typescript` (commit the generated `schema.d.ts`; add an
   `npm run api:generate` script). Do not hand-write DTO types that exist in the schema.
2. An HTTP client built on `openapi-fetch` (or fetch) that:
   - prefixes BASE_URL from env; sends `Accept-Language` from the current app language (ar|fr);
   - attaches `Authorization: Bearer <access>`;
   - unwraps the envelope `{ success, data, error, meta }`: return `{ data, meta }` on success, throw a typed
     `ApiError { status, code, messageKey, message, details, requestId }` on failure;
   - on 401 with code AUTH_TOKEN_EXPIRED: perform ONE refresh (`POST /auth/refresh { refresh_token, device_id? }`) with a
     single-flight lock shared by all concurrent requests, persist the new token pair, retry the original request once.
     Any other 401 code → clear tokens and emit a `session-ended` event;
   - adds `Idempotency-Key` (crypto.randomUUID) on `POST /orders/{id}/pay` and `POST /offers/{id}/accept`; the key is
     created by the caller per user action and reused for retries (expose an `idempotencyKey` option);
   - never logs tokens, codes, or request/response bodies.
3. Token storage adapter interface (`getTokens/setTokens/clear`) with a secure implementation for the platform
   (Keychain/Keystore via expo-secure-store or react-native-keychain on mobile; in-memory on web – never localStorage).
4. Domain modules mirroring the handoff screen files (auth, patient, pharmacy, delivery, admin, files, notifications,
   conversations, payments) exposing small functions, e.g. `requests.create(body)`, `orders.pay(orderId, { idempotencyKey })`.
5. React Query hooks (`@tanstack/react-query`) for reads and mutations with sensible query keys; invalidate the affected
   queries on mutation success and on realtime events.
6. A Socket.IO client wrapper for namespace `/realtime` (auth: { token }) that reconnects with the current access token
   and maps every event in realtime.md to query invalidations (events carry ids only – always refetch).
7. Helpers: `formatDzd(centimes)` (integers only, no floats), UTC→Africa/Algiers date formatting, status label lookup
   from statuses.md tables (ar/fr), `errorMessage(e)` that prefers `e.message` (already localized) and maps
   VALIDATION_FAILED `details[].field` to form fields.
8. Payment flow helper: `startPayment(orderId)` → open `redirect_url` → poll `GET /payments/{id}/status` every 2.5 s until
   CONFIRMED | FAILED or deadline; success only on CONFIRMED.
9. Unit tests (vitest/jest) for: envelope unwrapping, single-flight refresh under 5 concurrent 401s, idempotency key
   reuse on retry, error mapping.

Constraints: TypeScript strict; no `any` in public APIs; money stays integer centimes; never put medicine names in
local notifications; do not invent endpoints – if something is missing from openapi.json, list it in TODO.md.
When done, print the list of generated modules and how to run `npm run api:generate`.
````

Useful references for the agent:
- Envelope, headers, auth and refresh: [README.md](./README.md)
- Error codes and UX actions: [errors.md](./errors.md)
- Status labels: [statuses.md](./statuses.md)
- Events: [realtime.md](./realtime.md)
- Screens per app: [patient.md](./patient.md), [pharmacy.md](./pharmacy.md), [delivery.md](./delivery.md), [admin.md](./admin.md)
