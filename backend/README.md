# DEWA – Backend API

Bilingual (Arabic / French) healthcare marketplace for Algeria: patients ↔ licensed pharmacies, with delivery.
NestJS 10 · TypeScript (strict) · PostgreSQL on Neon (PostGIS) · Drizzle ORM · REST + Swagger.

## Quick start

```bash
npm install
# .env.local  → Neon DATABASE_URL / DATABASE_URL_UNPOOLED  (neon env pull)
# .env        → app secrets (copy .env.example and fill JWT_ACCESS_SECRET, ENCRYPTION_KEY, HASH_PEPPER)
npm run db:migrate      # apply SQL migrations (direct connection)
npm run db:seed         # wilayas/communes, settings, policies, super admin (if SEED_* set)
npm run start:dev       # http://localhost:3000  ·  Swagger: http://localhost:3000/docs
```

With Docker (local Postgres + Redis instead of Neon): `cp .env.example .env`, fill the secrets, `docker compose up --build`.

## Scripts

| Script | What it does |
|---|---|
| `start:dev` | Watch mode |
| `build` / `start:prod` | Compile to `dist/` / run it |
| `db:generate` | Create a migration from schema changes (`src/database/schema/*.ts`) |
| `db:migrate` | Apply pending migrations |
| `db:seed` | Idempotent seeds |
| `test` | Unit tests |
| `test:e2e` | End-to-end tests – **only** against the Neon branch in `.env.test` (safety-checked) |
| `docs` | Regenerate `docs/01-database.md` and `docs/api/errors.md` from code |
| `lint` / `format` | ESLint / Prettier |

## Documentation

| Doc | Content |
|---|---|
| [docs/01-database.md](docs/01-database.md) | ER diagrams (Mermaid) + field dictionary (generated) |
| [docs/api/00-conventions.md](docs/api/00-conventions.md) | Envelope, errors, i18n, pagination, rate limits |
| [docs/api/02-auth.md](docs/api/02-auth.md) | Auth, RBAC, sessions, MFA, devices, consents, invitations, admin users |
| [docs/api/errors.md](docs/api/errors.md) | Every error code with ar/fr messages (generated) |
| [docs/phase-reports/](docs/phase-reports/) | Per-phase summary, assumptions, open legal questions |

## Layout

```
src/
  config/            env schema (validated at boot)
  database/          Drizzle schema (one file per domain), migrate & seed scripts
  common/            envelope, errors, i18n, crypto, guards, decorators, throttling
  i18n/              ar.json / fr.json
  modules/
    auth/            registration, OTP, login, MFA, sessions, devices
    users/           /me, consents
    pharmacies/      staff invitations
    admin/           admin user management
    audit/           append-only audit log service
    messaging-providers/  ISmsProvider / IEmailProvider (+ console mocks)
    health/
drizzle/             SQL migrations (never edit applied ones)
test/                e2e tests
```
