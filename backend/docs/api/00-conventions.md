# 00 – API conventions

Applies to every endpoint. Interactive reference (all endpoints, schemas, examples): **`GET /docs`** (Swagger UI) and **`GET /docs-json`** (OpenAPI 3) on a running server.

## Base URL & versioning

- Local: `http://localhost:3000`
- No URL version prefix yet (v1 implied). Breaking changes will be announced and introduced under `/v2`.

## Headers

| Header | When | Notes |
|---|---|---|
| `Authorization: Bearer <access_token>` | Every non-public route | Access token lives **15 min** (`expires_in: 900`). |
| `Accept-Language: ar` \| `fr` | Optional, any route | Language of `error.message`. Default `fr`. |
| `Content-Type: application/json` | Bodies | Max body size **100 kB**. |
| `X-Request-Id` | Optional | Echoed back; otherwise generated. Quote it when reporting bugs. |

## Response envelope

Every response — success or error — has the same shape:

```json
{
  "success": true,
  "data": { "...": "..." },
  "error": null,
  "meta": { "request_id": "0c889658-4367-49f5-9970-ba6399d624b4" }
}
```

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message_key": "errors.AUTH_INVALID_CREDENTIALS",
    "message": "Identifiant ou mot de passe incorrect.",
    "details": null
  },
  "meta": { "request_id": "55cc1310-415c-462f-8011-4f8e2eda1743" }
}
```

- **Switch on `error.code`**, never on the message. `message` is already translated for display; `message_key` lets the app use its own translations.
- Full list of codes with ar/fr messages: [errors.md](./errors.md).

### Validation errors

`400 VALIDATION_FAILED` lists every invalid field:

```json
"error": {
  "code": "VALIDATION_FAILED",
  "message_key": "errors.VALIDATION_FAILED",
  "message": "Certaines données envoyées sont invalides.",
  "details": [
    { "field": "password", "errors": [{ "rule": "isStrongPassword", "message_key": "validation.isStrongPassword", "message": "Le mot de passe doit contenir au moins 10 caractères…" }] },
    { "field": "role", "errors": [{ "rule": "whitelistValidation", "message_key": "validation.whitelistValidation", "message": "Ce champ n'est pas autorisé." }] }
  ]
}
```

Unknown fields are **rejected** (not ignored). Strings are trimmed and control characters removed (except passwords, tokens, codes).

## Pagination, filtering, sorting

All list endpoints accept:

| Query | Type | Default | Rules |
|---|---|---|---|
| `page` | integer | 1 | ≥ 1 |
| `limit` | integer | 20 | 1–100 |
| `order` | `asc` \| `desc` | `desc` | |
| `sort` | endpoint-specific enum | endpoint-specific | listed per endpoint |
| filters | endpoint-specific | — | listed per endpoint |

Response: `data` is the array, `meta.pagination` = `{ page, limit, total, total_pages }`.

## Data formats

- IDs: UUID v4 strings.
- Timestamps: ISO-8601 **UTC** (`2026-10-16T10:00:00.000Z`).
- Money: **integer centimes of DZD** (`150000` = 1 500,00 DA). Never floats.
- Phones: send E.164 (`+213661234567`) or Algerian local (`0661234567`); always returned as E.164.
- Emails are lower-cased.
- Languages: `ar` | `fr`.

## Rate limits

| Scope | Limit (default) | Key |
|---|---|---|
| Global | 120 req / min | IP |
| `/auth/*` | 20 req / min | IP |
| `/auth/*` | 10 req / 15 min | targeted account (email/phone in body, or user) |

Exceeding a limit → `429 RATE_LIMITED`. Back off and retry later.

## Account status & roles

Roles: `PATIENT`, `PHARMACY_OWNER`, `PHARMACIST`, `PHARMACY_ASSISTANT`, `DELIVERY_COMPANY_ADMIN`, `DRIVER`, `ADMIN`, `SUPER_ADMIN`.

| Status | Meaning | API behaviour |
|---|---|---|
| `PENDING_VERIFICATION` | Patient: identifier not verified yet. Others: waiting for admin approval. | Can log in and use self-service routes (`/me`, sessions, devices, password, consents). Other routes → `403 ACCOUNT_PENDING_VERIFICATION`. |
| `ACTIVE` | Normal | — |
| `SUSPENDED` | Blocked by an admin | All sessions revoked; login → `403 ACCOUNT_SUSPENDED`. |
| `DELETED` | Soft-deleted | Treated as non-existent. |

Pharmacy features additionally require the pharmacy to be `VERIFIED` (`403 PHARMACY_NOT_VERIFIED`) and the user to be active staff of **that** pharmacy (`403 PHARMACY_ACCESS_DENIED`).

Resources owned by someone else return **`404 NOT_FOUND`** (not 403) so IDs cannot be probed.
