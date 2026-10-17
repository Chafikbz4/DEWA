# DEWA – prompts for building the frontend with Claude Code

This file is a **sequence of ready-to-paste prompts** for building the four DEWA interfaces (patient, pharmacy, delivery, admin) and wiring them to the backend in this repository.

Run them **in order**, one per Claude Code session or task. Paste **Prompt 0** at the start of every new session: it gives the agent the shared context and rules.

Before you start:
1. Run the backend locally (see "Running the backend" just below) and keep it running.
2. Open Claude Code at the repository root (`DEWA/`), so the agent can read `backend/docs/`.
3. Read `backend/docs/frontend-handoff/README.md` yourself once. It takes about 15 minutes and is worth it.

---

## Running the backend (for you and for the agent)

Requirements: Node 20, and Docker Desktop (for the local database).

```bash
cd backend
npm install
docker compose up -d postgres redis    # local PostGIS + Redis (no cloud account needed)
npm run setup:local                    # writes .env.local for that database, with generated secrets
npm run db:migrate                     # creates the schema
npm run db:seed                        # reference data: 58 wilayas, communes, settings, policies (all disabled)
DEMO_SEED_ALLOW=1 DEMO_PASSWORD=DewaDemo2026x npm run db:seed:demo   # demo pharmacies, accounts, enabled policies (dev only)
npm run start:dev                      # http://localhost:3000
```

If the project owner gives you the shared development database credentials instead, put them in `backend/.env.local`
and skip the `docker compose` and `setup:local` steps.

On macOS / Linux the `DEMO_SEED_ALLOW=1 …` syntax works as is. In Windows PowerShell use:
`$env:DEMO_SEED_ALLOW='1'; $env:DEMO_PASSWORD='DewaDemo2026x'; npm run db:seed:demo`.

| What | URL |
|---|---|
| API base | `http://localhost:3000` |
| Swagger UI (try every endpoint) | `http://localhost:3000/docs` |
| OpenAPI JSON | `http://localhost:3000/docs-json` (static copy: `backend/docs/openapi.json`) |
| Health / readiness | `http://localhost:3000/health`, `http://localhost:3000/ready` |
| Postman collection | `backend/docs/postman/` |

Demo accounts (password `DewaDemo2026x`):

| Account | Use it for |
|---|---|
| `patient@demo.dewa.dz` | patient app |
| `owner1@demo.dewa.dz`, `pharmacist1@demo.dewa.dz` | pharmacy app |
| `driver@demo.dewa.dz` | driver app |
| `company@demo.dewa.dz` | delivery company console |
| `super@`, `verification@`, `support@`, `finance@`, `compliance@demo.dewa.dz` | admin back-office (TOTP enrolment at first login – use an authenticator app) |

Other things to know in development:
- **SMS / e-mail codes** (OTP, invitations, collection codes) are not really sent. They are printed in the backend terminal: look for `[SMS → …]` lines.
- **Payments** use a mock gateway. Simulate the bank with `POST /payments/mock/{providerOrderId}/simulate { "result": "PAID" }`. The id is the last segment of `redirect_url`.
- `npm run demo` (in `backend/`) runs the whole happy path and is a good sanity check.

---

## Prompt 0 – Shared context (paste at the start of every session)

```text
You are a senior frontend engineer building the clients of DEWA, a bilingual (Arabic RTL / French) healthcare
marketplace in Algeria: patients send prescriptions to licensed pharmacies, compare offers, pay online (Edahabia/CIB,
mocked in dev), and pick up or get home delivery. The backend (NestJS) is in ./backend and already works.

Four interfaces:
1. Patient app (mobile-first)            – role PATIENT
2. Pharmacy app (web, tablet/desktop)     – roles PHARMACY_OWNER, PHARMACIST, PHARMACY_ASSISTANT
3. Delivery: driver app (mobile) + delivery company console (web) – roles DRIVER, DELIVERY_COMPANY_ADMIN
4. Admin back-office (web)                – roles ADMIN (with sub-role permissions) and SUPER_ADMIN

Sources of truth – read before coding and never contradict them:
- backend/docs/frontend-handoff/README.md      (base URL, auth + refresh, headers, envelope, files, payments, rules)
- backend/docs/frontend-handoff/{patient,pharmacy,delivery,admin}.md  (screens → endpoints)
- backend/docs/frontend-handoff/errors.md      (every error code + i18n key + suggested UX)
- backend/docs/frontend-handoff/statuses.md    (status values + ar/fr labels + meaning)
- backend/docs/frontend-handoff/realtime.md    (Socket.IO events)
- backend/docs/frontend-handoff/walkthrough.md (end-to-end happy path)
- backend/docs/openapi.json                    (exact request/response schemas)
- backend/docs/api/*.md                        (detailed field tables per domain)
The API runs at http://localhost:3000 (Swagger at /docs). Demo accounts use the password DewaDemo2026x.

Non-negotiable rules:
- Every response is an envelope { success, data, error{code,message_key,message,details}, meta{request_id,pagination} }.
  Branch on error.code, show error.message (already localized), show meta.request_id on unexpected errors.
- Send Accept-Language (ar|fr) on every call. Arabic is RTL: layouts, icons and navigation must mirror.
- Money is integer centimes of DZD – never floats; format on display (85000 → "850,00 DA" / "850٫00 د.ج").
- Times are UTC ISO strings; display in Africa/Algiers.
- Never compute prices/totals on the client; never treat a payment as successful before
  GET /payments/{id}/status returns CONFIRMED.
- POST /orders/{id}/pay and POST /offers/{id}/accept send an Idempotency-Key (UUID per user action, reused on retry).
- Tokens: access in memory; refresh in Keychain/Keystore (mobile) or memory/httpOnly cookie proxy (web), never
  localStorage. One single-flight refresh on 401 AUTH_TOKEN_EXPIRED; any other 401 → logout.
- Never show medicine names in push/local notifications or lock screens. Never log tokens, codes or patient data.
- Do not invent endpoints or fields. If the docs lack something, write it in docs/BACKEND_GAPS.md and continue
  with a clear TODO.
- TypeScript strict everywhere, accessible UI (labels, contrast, focus, screen-reader text in ar and fr).
Work in small, reviewable steps; after each step run lint, typecheck and tests, and summarize what changed.
```

---

## Prompt 1 – Architecture and workspace

```text
Set up the frontend workspace in ./FRONTEND as a pnpm (or npm workspaces) monorepo:

apps/
  patient-mobile/   Expo (React Native, TypeScript, expo-router)          – patient app
  driver-mobile/    Expo (React Native, TypeScript, expo-router)          – driver app
  pharmacy-web/     React + Vite + TypeScript (react-router)              – pharmacy app
  admin-web/        React + Vite + TypeScript (react-router)              – admin back-office + delivery company console
packages/
  api/              typed API client generated from backend/docs/openapi.json (Prompt 2)
  ui-web/           shared web design system (Tailwind or CSS variables + headless components)
  ui-native/        shared React Native components
  i18n/             ar/fr translation resources, RTL helpers, number/date/money formatters
  config/           eslint, prettier, tsconfig bases

Requirements:
- TypeScript strict, ESLint + Prettier, Vitest (web/packages) and Jest (Expo), Husky pre-commit (lint + typecheck).
- .env.example per app with API_BASE_URL=http://localhost:3000 (Expo: EXPO_PUBLIC_API_BASE_URL; Android emulator uses
  http://10.0.2.2:3000).
- i18n: i18next (+ react-i18next / expo-localization). Default language fr, switchable to ar at runtime, RTL applied
  globally (I18nManager on native, dir="rtl" on web). Store the choice; send it as Accept-Language.
- Root README.md: how to install, run each app against the local backend, run tests, and where the docs live.
- docs/ARCHITECTURE.md: folder structure, state management choice (TanStack Query for server state, Zustand only for
  local UI/session state), navigation map per app, error/loading/empty-state conventions.
Do not build screens yet. Finish with every app booting to a placeholder screen in both languages.
```

---

## Prompt 2 – Typed API client (shared package)

```text
Build packages/api from backend/docs/openapi.json, following backend/docs/frontend-handoff/claude-code-prompt.md
exactly (openapi-typescript types + openapi-fetch client). In addition:
- Export a createApiClient({ baseUrl, getLanguage, tokenStore, onSessionEnded }) factory usable by web and native.
- Envelope unwrapping → { data, meta }; failures throw ApiError { status, code, messageKey, message, details, requestId }.
- Single-flight refresh on 401 AUTH_TOKEN_EXPIRED (test with 5 concurrent requests), retry once; other 401 codes →
  tokenStore.clear() + onSessionEnded(code).
- idempotencyKey option for pay/accept; multipart helper for POST /files/upload (purpose + files[]).
- Domain modules: auth, me, geo, files, patients, requests, offers, orders, payments, delivery, pharmacy, catalog,
  conversations, notifications, complaints, admin. Each function is typed from the schema.
- TanStack Query hooks + a queryKeys factory; mutations invalidate affected keys.
- Realtime: createRealtime(baseUrl, getToken) for namespace /realtime → typed event emitter; map events to query
  invalidations as listed in realtime.md; reconnect with the current token.
- Helpers in packages/i18n: formatDzd(centimes, lang), formatDate(utcIso, lang), statusLabel(kind, value, lang) using
  the tables in statuses.md (copy them into JSON resources), errorText(apiError, t).
- npm run api:generate regenerates types; CI fails if the generated file is stale.
- Unit tests for envelope, refresh lock, idempotency reuse, error mapping, formatters.
Document usage in packages/api/README.md with examples for each domain.
```

---

## Prompt 3 – Design system and UX conventions

```text
Create the design system in packages/ui-web and packages/ui-native.

Visual principles:
- Calm and medical: a trustworthy green/teal primary, neutral greys, and clear status colours (success, warning,
  danger, info).
- Large touch targets (≥ 44 px), legible type, excellent Arabic typography: Noto Sans Arabic / IBM Plex Sans Arabic
  for ar, Inter for fr.

Components:
- Basics: Button, IconButton, TextField, PhoneField (+213 format), OtpInput (6 digits, paste and auto-fill),
  PasswordField (strength hint: ≥ 10 chars with upper, lower and a digit), Select, DatePicker.
- Feedback: Toast, Dialog / ConfirmDialog (with a required "reason" textarea variant for sensitive actions), Skeleton,
  EmptyState, ErrorState (shows the message + request id + retry).
- Data display: Card, Badge / StatusBadge (driven by statuses.md), Tabs, Stepper / Timeline (order timeline from
  GET /orders/{id}/timeline), DataTable (web: sort, filter, server pagination from meta.pagination), PriceTag
  (centimes → DA).
- Media: FileUploader / CameraCapture (images and PDF, ≤ 10 MB, up to 5 files, upload progress), MapView (pickup,
  dropoff, live driver marker).

Rules:
- Every component works in RTL and LTR, has ar/fr strings and dark-mode tokens, and meets WCAG AA contrast.
- Add Storybook (web) and a component gallery screen (native).
- Write docs/UX_CONVENTIONS.md covering: loading, empty and error states; optimistic UI rules (never for payments,
  validation or hand-over); how to show each error class (400 field errors, 401, 403, 404, 409 refetch, 422, 429
  back-off, 5xx) based on backend/docs/frontend-handoff/errors.md.
```

---

## Prompt 4 – Authentication and account (all apps)

```text
Implement authentication shared by all apps, following backend/docs/api/02-auth.md and the handoff README §3.

Screens:
- Language picker (first launch).
- Sign up for patients (POST /auth/register/patient with TERMS + PRIVACY consents at the server's current versions;
  show and accept them).
- OTP verification: POST /auth/otp/verify, resend with POST /auth/otp/request and a countdown on
  OTP_RESEND_COOLDOWN.
- Log in with password (POST /auth/login) or with SMS code (POST /auth/login/otp).
- MFA step: when the login response contains mfa_token, ask for the TOTP code (POST /auth/login/mfa). For admins on
  first login, run enrolment (POST /auth/mfa/setup → show the QR / secret → POST /auth/mfa/enable).
- Forgot and reset password.
- Account status screens: PENDING_VERIFICATION (pharmacy / driver / company waiting for an admin), SUSPENDED,
  locked account (AUTH_ACCOUNT_LOCKED with the remaining minutes).
- Mobile biometric login: generate a device_id once, POST /auth/devices { biometric_enabled: true }, store the
  refresh token behind biometrics, unlock → POST /auth/refresh { refresh_token, device_id }.
- Sessions and devices management, logout and logout-all.
- Privacy: data export (POST /me/data-export → save the JSON) and account deletion (patients: password + explicit
  confirmation; handle ACCOUNT_DELETION_BLOCKED by listing the active orders).

Role routing after login:
- PATIENT → patient app;
- pharmacy roles → pharmacy app;
- DRIVER → driver app;
- DELIVERY_COMPANY_ADMIN → company console;
- ADMIN / SUPER_ADMIN → back-office.
Anything else gets a clear "this app is not for your account" screen.

Tests: form validation, the OTP flow, refresh-on-expiry, logout on AUTH_SESSION_REVOKED. Write docs/AUTH_FLOW.md
with sequence diagrams.
```

---

## Prompt 5 – Patient app

```text
Build apps/patient-mobile screen by screen, using backend/docs/frontend-handoff/patient.md as the spec (every screen
lists its endpoints) and walkthrough.md as the reference flow.

1. Home: active requests and orders, a "New request" call to action, unread notifications.
2. Profile, addresses (wilaya → commune pickers from /geo, map pin for latitude/longitude, default address),
   dependants (with the proof upload), consents, notification preferences.
3. New request wizard:
   a. capture or upload the prescription pages (purpose PRESCRIPTION) and an optional Chifa card;
   b. items: free text + catalogue autocomplete (GET /medicines/search);
   c. delivery or pickup, address;
   d. pharmacies: automatic matching preview (POST /requests/preview-matching) or a manual choice on a map
      (GET /pharmacies/nearby?lat&lng&radius);
   e. review: the explicit per-request sharing consent (consent_to_share) → POST /requests.
   Handle REQUEST_CATEGORY_RESTRICTED and the other 422 codes with friendly explanations.
4. Request detail with status, the pharmacist's questions (conversation chat with attachments; phone numbers are
   refused by the server: explain why), offers list, and offer comparison (/requests/{id}/offers/compare). Approve or
   refuse proposed alternatives. Accept an offer with an Idempotency-Key, choosing PICKUP or DELIVERY.
5. Order detail: driven by next_actions and the timeline (localized labels from the API), live updates via
   order.status_changed.
6. Checkout and payment: the GET /orders/{id}/checkout breakdown → pay (Idempotency-Key) → open redirect_url in an
   in-app browser → poll the status every 2.5 s → success only on CONFIRMED; handle FAILED and
   PAYMENT_PROVIDER_ERROR (retry) and the deadline countdown.
7. Pickup: show the collection code full-screen (POST /orders/{id}/collection-code).
8. Delivery tracking: status, driver first name + vehicle, ETA, a map with the live marker (delivery.location events
   + GET /orders/{id}/delivery), and the delivery code to give at the door.
9. Receipt (JSON view + PDF download/share), refunds list and refund request, cancel order with a reason.
10. Notification centre, complaints (create, list, thread).

Each screen has loading, empty and error states, RTL screenshots in both languages, and component tests. Add a Maestro
or Detox e2e test for the full happy path against the local backend (demo accounts; simulate payment with the mock
endpoint). Write docs/PATIENT_APP.md (screens, navigation, data dependencies).
```

---

## Prompt 6 – Pharmacy app

```text
Build apps/pharmacy-web following backend/docs/frontend-handoff/pharmacy.md and backend/docs/api/04-pharmacy.md.

Role-aware UI (staff role from GET /pharmacy/me):
- assistants never see prescription / Chifa files and cannot validate;
- OWNER-only settings stay hidden for other roles.

Screens:
1. Onboarding and verification:
   - registration (POST /pharmacies/register) or invitation acceptance (POST /auth/invitations/preview →
     POST /auth/register/staff);
   - verification checklist (GET /pharmacy/verification);
   - document upload (PHARMACY_DOC → POST /pharmacy/documents);
   - submit for review;
   - "waiting for review" state.
2. Dashboard: GET /pharmacy/reports/summary, today's queue.
3. Request inbox (filters, realtime request.status_changed):
   - detail with the prescription viewer (signed URLs via GET /files/{id}/access-url; never cache them);
   - delivery area only;
   - accept interest or decline with a reason;
   - ask a clarification (chat).
4. Offer builder:
   - lines with prices in DA converted to centimes on submit, availability, alternatives, preparation time,
     delivery toggle;
   - totals and delivery fee come from the server response;
   - draft → send → withdraw.
5. Orders board (kanban by status) and order detail driven by next_actions:
   - validate (explicit confirmation + note, OWNER/PHARMACIST only);
   - start preparing, ready;
   - counter hand-over with the patient's collection code (show attempts left);
   - cancel with a reason;
   - delivery panel (pickup code for the driver, confirm the parcel's return);
   - partial refund request.
6. Settings: profile, opening hours, on-duty (garde), service areas, staff and invitations, payout accounts (masked),
   stock list + CSV import with the dry-run report.
7. Settlements (read-only), complaints (reply), notifications.

Desktop-first, keyboard friendly, works on tablets. Add tests for role visibility and the offer builder maths
(display only). Write docs/PHARMACY_APP.md.
```

---

## Prompt 7 – Driver app and delivery company console

```text
Build apps/driver-mobile and the company console (inside apps/admin-web under /company, or as its own app) following
backend/docs/frontend-handoff/delivery.md and backend/docs/api/08-delivery.md.

Privacy: these apps never receive medicine names, prescriptions or Chifa data. Do not add any screen or log that
could display them. The parcel is shown by its PKG-XXXXXX label.

Driver app:
1. Registration (POST /delivery/register, account_type DRIVER), documents (DRIVER_DOC), the "pending verification"
   state, joining a company with an invitation token.
2. Online/offline toggle; background location every ≥ 10 s while online (respect 429 DELIVERY_LOCATION_THROTTLED
   retry_after_seconds); a battery-aware strategy.
3. Job board: cards with the pharmacy, the destination area, distance, fee and payout; pull to refresh; push
   DELIVERY_JOB_AVAILABLE. Accept (409 DELIVERY_ALREADY_TAKEN → remove the card with a toast).
4. Active job flow, as a stepper:
   - go to the pharmacy → enter the pickup code (attempts left, lockout) → start with an ETA;
   - navigate (deep link to Google Maps / Waze) → confirm the delivery with exactly one proof: the patient's code
     (preferred), a signature pad, or a photo with a "no face visible" confirmation (upload PROOF_OF_DELIVERY first);
   - failure → reason + attempts → return to the pharmacy → confirm the return.
   - Release a job before pickup, with a reason (daily limit).
5. History and earnings (records only).

Company console:
- profile and documents;
- drivers list (availability, active jobs, remove);
- invitations (phone or e-mail);
- reports with charts (by status, success rate, fees, payouts, per driver; date range).

Write docs/DELIVERY_APPS.md and an e2e test of the job flow against the local backend.
```

---

## Prompt 8 – Admin back-office

```text
Build apps/admin-web following backend/docs/frontend-handoff/admin.md and backend/docs/api/09-admin.md (the
permission matrix per endpoint).

- After login (MFA mandatory), load GET /admin/me/permissions and build the navigation from permissions[]. Hide
  every action whose permission is missing; on 403 PERMISSION_DENIED read details.required.
- Every sensitive or destructive action opens a ConfirmDialog with a mandatory reason (≥ 5 characters).
- Sensitive access (permission sensitive.access):
  - viewing prescription / Chifa content or a conversation first opens a "Justify access" dialog
    (POST /admin/sensitive-access, justification ≥ 20 characters);
  - then show the content with a visible 30-minute countdown banner (expires_at) and a "close access" button;
  - on 403 SENSITIVE_ACCESS_GRANT_REQUIRED, reopen the dialog.
- Modules:
  - dashboard (analytics overview: KPI tiles + charts by date and by wilaya, date-range and wilaya filters);
  - users (search, view, suspend / reactivate);
  - admin team and permission matrix (SUPER_ADMIN);
  - verification queues with document viewer and approve / reject / request documents;
  - requests and orders monitoring (metadata only);
  - payments dashboard, reconciliation issues, refund queue, settlements;
  - delivery zones / fee rules / timeouts;
  - complaints (assign, status, internal notes clearly marked "internal", resolve with an outcome);
  - commission rules (created disabled; activation needs the legal note);
  - eligibility policies (enabling needs legal_basis_reference; warn loudly for CONTROLLED / PSYCHOTROPIC);
  - medicine catalogue + CSV import with the dry-run report;
  - audit logs (filters + CSV export), security events, retention jobs;
  - platform settings (typed editors, change history);
  - notification templates (only the default placeholders are allowed; live preview in ar/fr).
- DataTables with server pagination, URL-synced filters, CSV export where the API provides it.
Write docs/ADMIN_APP.md including the permission → screen mapping. Add tests for permission-based visibility.
```

---

## Prompt 9 – Realtime, push notifications and offline behaviour

```text
Wire realtime and notifications in every app:
- One Socket.IO connection per signed-in session (packages/api createRealtime). On each event in
  backend/docs/frontend-handoff/realtime.md, invalidate the queries listed there. Refetch the visible screen when the
  app returns to the foreground; events are not replayed.
- Push (Expo Notifications / FCM / APNs): register the push token with POST /auth/devices; route a notification tap
  by data.type and its ids to the right screen. Never put medicine names in local notifications.
- Notification centre: GET /notifications with meta.unread_count badge, mark read, read-all; preferences screen
  (security codes cannot be muted).
- Offline: show a banner and disable mutations; never queue payments or hand-over actions offline.
Write docs/REALTIME_AND_NOTIFICATIONS.md.
```

---

## Prompt 10 – Quality pass, tests and frontend documentation

```text
Do a full quality pass on the frontend:
1. Contract check: compare every API call in packages/api and the apps with backend/docs/openapi.json; fix
   mismatches; list missing backend features in docs/BACKEND_GAPS.md.
2. Error handling audit: every error code that an app can receive (errors.md) has a user-facing message and the
   suggested UX; there is no raw JSON or stack trace on screen.
3. i18n audit: no hard-coded strings; every screen checked in Arabic (RTL) and French; numbers, dates and money
   formatted per locale.
4. Security audit: tokens storage, no secrets in logs or analytics, signed URLs not cached, no medicine names in
   notifications, deep links validated, web CSP headers documented.
5. Accessibility audit (axe on web, accessibility labels on native).
6. Tests: unit coverage for packages ≥ 80 %; e2e happy paths for patient, pharmacy, driver and admin against the local
   backend with the demo accounts (see FRONTEND/prompts.md "Running the backend").
7. CI (GitHub Actions in .github/workflows/frontend.yml): install, lint, typecheck, unit tests, build each app, and
   check that the generated API types are up to date.
8. Documentation for the next developer:
   - FRONTEND/README.md (setup, scripts, environments, demo accounts);
   - docs/ARCHITECTURE.md;
   - one doc per app (screens, navigation map, endpoints used);
   - docs/CONTRIBUTING.md (branching, commit style, how to add a screen, how to regenerate the API client after a
     backend change: `cd backend && npm run docs:openapi && npm run docs:handoff`, then `npm run api:generate`).
Report findings as a checklist with what you fixed and what remains.
```

---

## Prompt for single screens (template)

Use this when you only need one screen or one change:

```text
Using Prompt 0's rules, build the screen "<SCREEN NAME>" in <APP>. Spec: backend/docs/frontend-handoff/<app>.md row
"<row title>"; field tables: backend/docs/api/<file>.md section "<section>"; schemas: backend/docs/openapi.json
paths <list the paths>. Include loading / empty / error states, ar + fr strings, RTL check, and a component test.
Do not change packages/api by hand – regenerate it if the schema changed.
```

## When the backend changes

```text
The backend API changed. Run `cd backend && npm run docs:openapi && npm run docs:handoff`, then regenerate the client
(`npm run api:generate` in FRONTEND). Diff backend/docs/openapi.json against the previous commit, list breaking and
non-breaking changes, update the affected screens and tests, and update docs/BACKEND_GAPS.md.
```
