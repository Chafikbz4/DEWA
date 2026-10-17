# DEWA frontend – start here

DEWA is a bilingual (Arabic / French) pharmacy marketplace for Algeria. Patients send prescriptions to licensed pharmacies, compare offers, pay online and pick up or get home delivery.

**The backend is finished and tested.** This folder is where the frontend apps will be built.

## What exists already (backend)

The API lives in [`../backend`](../backend) and has 256 endpoints, all tested. It covers:

- **Accounts**: sign-up with SMS code, login, MFA for admins, token refresh, sessions, data export and account deletion.
- **Patients**: profile, addresses, dependants, prescription upload, requests to pharmacies, comparing offers, orders, payment, receipt, delivery tracking, complaints.
- **Pharmacies**: verification, request inbox, offers, prescription validation, preparation, hand-over, stock, reports.
- **Delivery**: driver and company onboarding, job board, pickup and delivery codes, proof of delivery, live location.
- **Admin back-office**: per-permission access, verification queues, monitoring, refunds, settlements, settings, analytics, audit log.
- **Realtime** (Socket.IO) and push notifications.

Arabic and French are supported through the `Accept-Language` header. Payments use a **mock gateway in development**; the real Edahabia connection comes later.

## The apps to build

| App | Users | Suggested stack |
|---|---|---|
| Patient app | patients | Expo (React Native) |
| Driver app | drivers | Expo (React Native) |
| Pharmacy app | pharmacy staff | React + Vite (web) |
| Admin back-office + delivery company console | admins, delivery companies | React + Vite (web) |

## Run the backend locally

You need Node 20 and Docker Desktop.

```bash
cd backend
npm install
docker compose up -d postgres redis
npm run setup:local          # creates .env.local for the local database
npm run db:migrate
npm run db:seed
DEMO_SEED_ALLOW=1 DEMO_PASSWORD=DewaDemo2026x npm run db:seed:demo
npm run start:dev
```

In Windows PowerShell, replace the demo seed line with:
`$env:DEMO_SEED_ALLOW='1'; $env:DEMO_PASSWORD='DewaDemo2026x'; npm run db:seed:demo`

Then open:
- API: http://localhost:3000
- **Swagger docs (try every endpoint): http://localhost:3000/docs**

### Demo accounts

All demo accounts use the password `DewaDemo2026x`.

| Account | App |
|---|---|
| `patient@demo.dewa.dz` | patient |
| `pharmacist1@demo.dewa.dz`, `owner1@demo.dewa.dz` | pharmacy |
| `driver@demo.dewa.dz` | driver |
| `company@demo.dewa.dz` | delivery company |
| `super@demo.dewa.dz` | admin (asks for an authenticator app at first login) |

### Development notes

- SMS codes are not really sent: they appear in the backend terminal on lines starting with `[SMS → …]`.
- To make a test payment succeed, call `POST /payments/mock/{id}/simulate {"result":"PAID"}`. The `id` is the last part of `redirect_url`.
- `npm run demo` (in `backend/`) runs the whole patient journey automatically. It is a quick way to check that your backend works.

## Documentation

| Read | For |
|---|---|
| [`../backend/docs/frontend-handoff/README.md`](../backend/docs/frontend-handoff/README.md) | **Start here**: auth and token refresh, headers, response format, errors, files, payments, rules |
| [`../backend/docs/frontend-handoff/`](../backend/docs/frontend-handoff/) `patient.md`, `pharmacy.md`, `delivery.md`, `admin.md` | Screens of each app and the endpoints each screen calls |
| `errors.md`, `statuses.md`, `realtime.md`, `walkthrough.md` (same folder) | Error codes with UX advice, status labels in ar/fr, socket events, the full happy path |
| [`../backend/docs/openapi.json`](../backend/docs/openapi.json) | Exact API contract (generate the TypeScript client from it) |
| [`../backend/docs/postman/`](../backend/docs/postman/) | Postman / Insomnia collection |
| [`prompts.md`](./prompts.md) | **Ready-to-paste Claude Code prompts** to build the apps step by step |

## What to do next

1. Run the backend locally (see above) and open http://localhost:3000/docs. Log in with the demo patient account and try a few endpoints.
2. Read `backend/docs/frontend-handoff/README.md`.
3. Open Claude Code at the repository root and follow [`prompts.md`](./prompts.md) in order:
   - Prompt 0 (shared rules) at the start of every session;
   - Prompt 1: workspace setup;
   - Prompt 2: API client;
   - Prompt 3: design system;
   - Prompt 4: authentication;
   - Prompts 5 to 8: the apps;
   - Prompts 9 and 10: notifications and the final quality pass.
4. If something you need is missing from the API, write it in `docs/BACKEND_GAPS.md` and tell the backend owner. Do not invent endpoints.

## Rules that matter

- Every amount is an **integer in centimes of DZD**. Never compute prices on the client.
- A payment is successful **only** when `GET /payments/{id}/status` returns `CONFIRMED`.
- Arabic is right-to-left: every screen must work in both `ar` and `fr`.
- Never show medicine names in notifications. Never store tokens in browser `localStorage`.
