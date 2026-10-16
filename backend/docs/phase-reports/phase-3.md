# Phase 3 report – Patient domain

## Built
- Patient profile (`/patients/me`) with encrypted, masked national id.
- Saved addresses CRUD with wilaya/commune validation, single default, soft delete.
- Dependants CRUD with DECLARED → VERIFIED/REJECTED workflow (admin decision in Phase 9) and configurable allowed relationships.
- Files: multipart upload, magic-byte type detection (JPEG/PNG/PDF), size/count limits, SHA-256, malware-scan interface (mock flags EICAR), AES-256-GCM encryption at rest, `IStorageProvider` (local disk / S3-compatible), signed short-lived download links, audit + sensitive-access logging, pluggable access rules.
- Geo reference endpoints, public nearby-pharmacies search (PostGIS, open-now incl. garde).
- Requests: preview matching, PRESCRIPTION / CHIFA / PRODUCT submission, unique reference, per-request share consent, eligibility policy enforcement, recipients, advisory OCR job (`IOcrProvider` mock), CHIFA with `ICnasVerificationProvider` (default NOT_AVAILABLE), item editing, cancel, expiry cron.
- Infrastructure: settings service (single defaults file), job queue (in-process or BullMQ when `REDIS_URL`), domain events emitted after commit (UnitOfWork), key-rotation-ready CryptoService.

## Endpoints
`GET /geo/wilayas`, `GET /geo/wilayas/:id/communes`, `GET /pharmacies/nearby`,
`GET|PATCH /patients/me`, `GET|POST /patients/me/addresses`, `GET|PATCH|DELETE /patients/me/addresses/:id`, `POST /patients/me/addresses/:id/default`,
`GET|POST /patients/me/dependants`, `GET|PATCH|DELETE /patients/me/dependants/:id`,
`POST /files/upload`, `GET /files/:id`, `GET /files/:id/access-url`, `GET /files/download/:token`,
`POST /requests/preview-matching`, `POST /requests`, `GET /requests`, `GET /requests/:id`, `POST /requests/:id/cancel`, `POST /requests/:id/items`, `PATCH|DELETE /requests/:id/items/:itemId`.

## Migration
`drizzle/0004_patient_domain.sql` – `request_urgency` enum + `requests.urgency`, file purpose `DEPENDANT_PROOF`. New platform settings are seeded by `npm run db:seed`.

## Tests
`test/patient.e2e-spec.ts` (17): geo, nearby, addresses, NIN masking, dependant rules, upload validation (magic bytes, malware, purpose), signed-link access control (owner, other patient, recipient owner/pharmacist logged, assistant denied, other pharmacy denied, consent revocation), automatic + chosen matching, OCR advisory items, consent required, restricted category, delivery not allowed, file reuse, CHIFA never verified, ownership, cancel, expiry.

## Assumptions
1. `address_id` is required for every request (matching needs a location, even for pickup).
2. Automatic matching only picks pharmacies open now / on duty by default (`matching_only_open_pharmacies`); overnight opening ranges are evaluated for the current day only.
3. Pharmacies without service areas only cover their own commune.
4. A prescription file can belong to one request only.
5. Editing an OCR suggestion converts it to a patient item; items are editable until the first offer.
6. Cancelling a request whose order is still active is refused – the order must be cancelled (Phase 6).
7. Malware scanning is a mock (EICAR only) – a real engine must be plugged in before production.
8. PDFs are accepted but not rendered/converted server-side; OCR mock does not read content.

## Open legal questions
- Retention period for prescription and CHIFA images (`sensitive_data_retention_days`, placeholder 365).
- Whether a scanned prescription is enough or the original must be shown at hand-over.
- Ordering on behalf of dependants: what proof is legally required.
- CNAS/CHIFA: an official verification API and agreement are required; none is integrated.
