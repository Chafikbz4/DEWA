# Phase 11 report – Frontend handoff package

Location: [docs/frontend-handoff/](../frontend-handoff/README.md).

| Deliverable | File | How it is produced |
|---|---|---|
| README: base URL, auth flow, token refresh (single-flight), headers (Accept-Language, Idempotency-Key, X-Request-Id, X-Device-Id), envelope, error handling, files, payments, things never to do | `README.md` | written |
| Error catalogue: 193 codes with HTTP status, i18n key, fr/ar message, suggested UX action | `errors.md` | **generated** (`npm run docs:handoff`) from the error catalogue and i18n files |
| One file per interface: screens, the endpoints each screen calls, links to the exact field tables in `docs/api/*.md` and `openapi.json` | `patient.md`, `pharmacy.md`, `delivery.md`, `admin.md` | written |
| Status dictionaries (request, offer, order, payment, delivery) with ar/fr labels and user-facing explanations | `statuses.md` | **generated** from `labels.*` |
| Realtime events catalogue and push notification types | `realtime.md` | written |
| cURL example for every endpoint (256 operations) | `curl/{common,patient,pharmacy,delivery,admin}.md` | **generated** from `docs/openapi.json` |
| End-to-end happy path (register → prescription → offer → accept → pay → prepare → delivery → receipt) | `walkthrough.md` (+ `npm run demo` for the pickup variant) | written |
| Prompt for Claude Code to generate the TypeScript client (openapi-typescript + openapi-fetch, refresh lock, idempotency, React Query, socket wrapper, tests) | `claude-code-prompt.md` | written |
| Machine-readable contract | `docs/openapi.json`, `docs/postman/*.json` | **generated** (`npm run docs:openapi`) |

Regenerate after any API change: `npm run docs:openapi && npm run docs:handoff`.

Fixed while writing the handoff:
- CORS `Idempotency-Key` (see the Phase 10 report);
- `docs/api/05-realtime.md` (`delivery.location` sends `updated_at`);
- `docs/api/02-auth.md` (admin endpoints now use permissions).
