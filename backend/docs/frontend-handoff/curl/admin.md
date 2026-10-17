# cURL – Administration (generated)

`export BASE_URL=http://localhost:3000 TOKEN=<access_token>`. Bodies are minimal examples built from the OpenAPI schemas – replace `<…>` placeholders. 72 endpoints.

### GET /admin/payments/reconciliation

Reconciliation issues (amount mismatch, duplicates, stale, missing, orphan events)

```bash
curl -X GET "$BASE_URL/admin/payments/reconciliation" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/payments/reconciliation/run

Run reconciliation now

```bash
curl -X POST "$BASE_URL/admin/payments/reconciliation/run" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/payments/reconciliation/{id}/resolve

Resolve an issue (note required, audited)

```bash
curl -X POST "$BASE_URL/admin/payments/reconciliation/<id>/resolve" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"note":"<string>"}'
```

### GET /admin/refunds

Refund queue

```bash
curl -X GET "$BASE_URL/admin/refunds" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/refunds/{id}/approve

Approve and execute a refund with the provider

```bash
curl -X POST "$BASE_URL/admin/refunds/<id>/approve" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/refunds/{id}/reject

Reject a refund (reason required)

```bash
curl -X POST "$BASE_URL/admin/refunds/<id>/reject" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents frauduleux signalés par la DSP"}'
```

### GET /admin/settlements

Settlement records (records only unless payouts are legally allowed)

```bash
curl -X GET "$BASE_URL/admin/settlements" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/settlements/generate

Generate settlements for a period (idempotent)

```bash
curl -X POST "$BASE_URL/admin/settlements/generate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"period_start":"2026-10-05","period_end":"2026-10-12"}'
```

### POST /admin/settlements/{id}/approve

Approve a DRAFT settlement

```bash
curl -X POST "$BASE_URL/admin/settlements/<id>/approve" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/settlements/{id}/mark-paid

Record an off-platform payout for an APPROVED settlement

```bash
curl -X POST "$BASE_URL/admin/settlements/<id>/mark-paid" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"payout_reference":"VIR-2026-10-0042"}'
```

### GET /admin/retention/jobs

Runs of the retention / secure deletion jobs

```bash
curl -X GET "$BASE_URL/admin/retention/jobs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/retention/run

Run the retention jobs now (SUPER_ADMIN)

```bash
curl -X POST "$BASE_URL/admin/retention/run" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/users

Create an ADMIN account (super admin only)

```bash
curl -X POST "$BASE_URL/admin/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents verified – ticket #4521","email":"ops.admin@dewa.dz","first_name":"Nadia","last_name":"Kaci","password":"Init1alAdm1nPass","preferred_language":"fr"}'
```

### GET /admin/users

List users (filter, search, sort, paginate)

```bash
curl -X GET "$BASE_URL/admin/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/users/{id}

One account (contact, status, names, admin sub-roles) – never health data; audited

```bash
curl -X GET "$BASE_URL/admin/users/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/users/{id}/suspend

Suspend (reason required): sessions revoked, user notified, audited

```bash
curl -X POST "$BASE_URL/admin/users/<id>/suspend" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents frauduleux signalés par la DSP"}'
```

### POST /admin/users/{id}/reactivate

Reactivate (reason required): user notified, audited

```bash
curl -X POST "$BASE_URL/admin/users/<id>/reactivate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents frauduleux signalés par la DSP"}'
```

### PATCH /admin/users/{id}/status

Activate or suspend an account

```bash
curl -X PATCH "$BASE_URL/admin/users/<id>/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents verified – ticket #4521","status":"SUSPENDED"}'
```

### PATCH /admin/users/{id}/role

Change a user role (super admin only)

```bash
curl -X PATCH "$BASE_URL/admin/users/<id>/role" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents verified – ticket #4521","role":"ADMIN"}'
```

### GET /admin/me/permissions

My admin sub-roles and effective permissions (any MFA-enabled admin)

```bash
curl -X GET "$BASE_URL/admin/me/permissions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/permissions

Permission matrix per admin sub-role (SUPER_ADMIN)

```bash
curl -X GET "$BASE_URL/admin/permissions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### PUT /admin/permissions/{role}

Replace the permissions of a sub-role (SUPER_ADMIN, audited)

```bash
curl -X PUT "$BASE_URL/admin/permissions/<role>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents frauduleux signalés par la DSP","permissions":["users.read"]}'
```

### PUT /admin/users/{id}/admin-roles

Set the sub-roles of an ADMIN account (SUPER_ADMIN, audited; removal revokes sessions)

```bash
curl -X PUT "$BASE_URL/admin/users/<id>/admin-roles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents frauduleux signalés par la DSP","roles":["VERIFICATION_ADMIN"]}'
```

### GET /admin/verification/{kind}

Verification queue (oldest first; default status = pending)

```bash
curl -X GET "$BASE_URL/admin/verification/<kind>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/verification/{kind}/{id}

Entity under review with its documents (open them with GET /files/:file_id/access-url – logged)

```bash
curl -X GET "$BASE_URL/admin/verification/<kind>/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/verification/{kind}/{id}/approve

Approve: entity VERIFIED, pending documents APPROVED, account ACTIVE, holder notified

```bash
curl -X POST "$BASE_URL/admin/verification/<kind>/<id>/approve" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"note":"<string>"}'
```

### POST /admin/verification/{kind}/{id}/reject

Reject with a reason (holder notified)

```bash
curl -X POST "$BASE_URL/admin/verification/<kind>/<id>/reject" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents frauduleux signalés par la DSP"}'
```

### POST /admin/verification/{kind}/{id}/request-documents

Ask for more / new documents (listed types are marked REJECTED; pharmacies go back to DRAFT to resubmit)

```bash
curl -X POST "$BASE_URL/admin/verification/<kind>/<id>/request-documents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents frauduleux signalés par la DSP"}'
```

### GET /admin/requests

Requests – metadata only (no items, files, notes or Chifa data)

```bash
curl -X GET "$BASE_URL/admin/requests" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/requests/{id}

Request metadata: recipients, offers (totals only), counts

```bash
curl -X GET "$BASE_URL/admin/requests/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/requests/{id}/content

Prescription items, files and Chifa data of a request

```bash
curl -X GET "$BASE_URL/admin/requests/<id>/content" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/orders

Orders – amounts, statuses, parties (no item names)

```bash
curl -X GET "$BASE_URL/admin/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/orders/{id}

Order metadata with status history, payments, refunds and delivery

```bash
curl -X GET "$BASE_URL/admin/orders/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/conversations/{id}/messages

Messages of a conversation – requires an active CONVERSATION grant; logged

```bash
curl -X GET "$BASE_URL/admin/conversations/<id>/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/sensitive-access

Open a time-limited grant to sensitive content

```bash
curl -X POST "$BASE_URL/admin/sensitive-access" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"resource_type":"REQUEST","resource_id":"<uuid>","justification":"Litige COMP-2026-000123 : vérifier la conformité de l’ordonnance"}'
```

### GET /admin/sensitive-access

My grants (all=true lists every admin’s grants – requires audit.read)

```bash
curl -X GET "$BASE_URL/admin/sensitive-access" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### DELETE /admin/sensitive-access/{id}

Close one of my grants early

```bash
curl -X DELETE "$BASE_URL/admin/sensitive-access/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/payments/dashboard

Reconciliation dashboard: pending / failed payments, captured amount, refunds to process, settlements, open issues by kind

```bash
curl -X GET "$BASE_URL/admin/payments/dashboard" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/delivery/zones

Delivery zones

```bash
curl -X GET "$BASE_URL/admin/delivery/zones" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/delivery/zones

Create a zone (whole wilaya or one commune)

```bash
curl -X POST "$BASE_URL/admin/delivery/zones" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"wilaya_id":16}'
```

### PATCH /admin/delivery/zones/{id}

Activate / deactivate a zone

```bash
curl -X PATCH "$BASE_URL/admin/delivery/zones/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"is_active":true}'
```

### GET /admin/delivery/fee-rules

Delivery fee rules

```bash
curl -X GET "$BASE_URL/admin/delivery/fee-rules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/delivery/fee-rules

Create a fee rule (base + per km, clamped to [min, max])

```bash
curl -X POST "$BASE_URL/admin/delivery/fee-rules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"zone_id":"<uuid>","base_fee_centimes":20000}'
```

### PATCH /admin/delivery/fee-rules/{id}

Update / deactivate a fee rule (audited before/after)

```bash
curl -X PATCH "$BASE_URL/admin/delivery/fee-rules/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"base_fee_centimes":1,"per_km_centimes":1,"min_fee_centimes":1,"max_fee_centimes":1,"is_active":true}'
```

### GET /admin/delivery/settings

Delivery timeouts and limits

```bash
curl -X GET "$BASE_URL/admin/delivery/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### PATCH /admin/delivery/settings

Change delivery timeouts / limits (reason required; history kept)

```bash
curl -X PATCH "$BASE_URL/admin/delivery/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents frauduleux signalés par la DSP"}'
```

### GET /admin/complaints

Complaints / disputes queue

```bash
curl -X GET "$BASE_URL/admin/complaints" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/complaints/{id}

Complaint with messages and internal notes

```bash
curl -X GET "$BASE_URL/admin/complaints/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/complaints/{id}/assign

Assign to an admin (default: yourself); OPEN → IN_REVIEW

```bash
curl -X POST "$BASE_URL/admin/complaints/<id>/assign" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"admin_user_id":"<uuid>"}'
```

### PATCH /admin/complaints/{id}/status

IN_REVIEW / ESCALATED / REJECTED (reason required)

```bash
curl -X PATCH "$BASE_URL/admin/complaints/<id>/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents frauduleux signalés par la DSP","status":"IN_REVIEW"}'
```

### POST /admin/complaints/{id}/notes

Internal note (never visible to the parties)

```bash
curl -X POST "$BASE_URL/admin/complaints/<id>/notes" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"body":"<string>"}'
```

### POST /admin/complaints/{id}/resolve

Resolve with an outcome

```bash
curl -X POST "$BASE_URL/admin/complaints/<id>/resolve" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"outcome":"NONE","note":"<string>"}'
```

### GET /admin/commission-rules

Commission / subscription rules

```bash
curl -X GET "$BASE_URL/admin/commission-rules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/commission-rules

Create a rule – always created DISABLED; legal_review_note required

```bash
curl -X POST "$BASE_URL/admin/commission-rules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"scope":"GLOBAL","type":"PERCENT","value":500,"legal_review_note":"<string>"}'
```

### PATCH /admin/commission-rules/{id}

Update / activate a rule (activation requires a legal_review_note)

```bash
curl -X PATCH "$BASE_URL/admin/commission-rules/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents frauduleux signalés par la DSP"}'
```

### GET /admin/eligibility-policies

Eligibility policies per medicine category

```bash
curl -X GET "$BASE_URL/admin/eligibility-policies" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### PATCH /admin/eligibility-policies/{id}

Change a policy (immediate, audited)

```bash
curl -X PATCH "$BASE_URL/admin/eligibility-policies/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents frauduleux signalés par la DSP"}'
```

### GET /admin/medicines

Medicines (incl. inactive)

```bash
curl -X GET "$BASE_URL/admin/medicines" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /admin/medicines

Create a medicine

```bash
curl -X POST "$BASE_URL/admin/medicines" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"brand_name":"<string>","category":"OTC"}'
```

### POST /admin/medicines/import

CSV import (create or update by regulatory_code)

```bash
curl -X POST "$BASE_URL/admin/medicines/import" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -F "purpose=PRESCRIPTION" -F "files=@./ordonnance.jpg"
```

### PATCH /admin/medicines/{id}

Update a medicine (audited before/after)

```bash
curl -X PATCH "$BASE_URL/admin/medicines/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"brand_name":"<string>","category":"OTC","name_ar":"<string>","inn_dci":"<string>","form":"<string>","dosage":"<string>","pack_size":"<string>","manufacturer":"<string>","requires_prescription":true,"reimbursable_flag":true,"regulatory_code":"<string>","is_active":true}'
```

### DELETE /admin/medicines/{id}

Deactivate (soft delete) a medicine

```bash
curl -X DELETE "$BASE_URL/admin/medicines/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/analytics/overview

Requests, offer conversion, orders by status, GMV, delivery success, response time – by wilaya and date

```bash
curl -X GET "$BASE_URL/admin/analytics/overview" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/audit-logs

Audit trail (filters, paginated)

```bash
curl -X GET "$BASE_URL/admin/audit-logs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/audit-logs/export

CSV export of the audit trail (same filters, max 10 000 rows; the export is audited)

```bash
curl -X GET "$BASE_URL/admin/audit-logs/export" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/security-events

Security events (failed logins, lockouts, token reuse, sensitive reads…) + last-24h signals (suspicious IPs)

```bash
curl -X GET "$BASE_URL/admin/security-events" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/settings

Platform settings with defaults and allowed values

```bash
curl -X GET "$BASE_URL/admin/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### PATCH /admin/settings/{key}

Change a setting (typed; reason required; history kept)

```bash
curl -X PATCH "$BASE_URL/admin/settings/<key>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents frauduleux signalés par la DSP","value":{}}'
```

### GET /admin/settings/{key}/history

Change history of a setting

```bash
curl -X GET "$BASE_URL/admin/settings/<key>/history" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /admin/notification-templates

Notification templates (defaults + overrides) per type and language

```bash
curl -X GET "$BASE_URL/admin/notification-templates" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### PUT /admin/notification-templates/{type}/{lang}

Override a template (only the default template’s placeholders are allowed)

```bash
curl -X PUT "$BASE_URL/admin/notification-templates/<type>/<lang>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Documents frauduleux signalés par la DSP","title":"Code de livraison","body":"Votre code pour la commande {reference} : {code}."}'
```

### DELETE /admin/notification-templates/{type}/{lang}

Back to the default template

```bash
curl -X DELETE "$BASE_URL/admin/notification-templates/<type>/<lang>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```
