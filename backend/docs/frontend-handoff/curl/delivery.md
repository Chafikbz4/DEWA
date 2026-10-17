# cURL – Delivery (drivers & companies) (generated)

`export BASE_URL=http://localhost:3000 TOKEN=<access_token>`. Bodies are minimal examples built from the OpenAPI schemas – replace `<…>` placeholders. 26 endpoints.

### POST /delivery/register

Register a delivery company or an independent driver

```bash
curl -X POST "$BASE_URL/delivery/register" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"password":"Str0ngPassw0rd","first_name":"Amina","last_name":"Benali","preferred_language":"fr","consents":[{"type":"TERMS","version":"2026-10"},{"type":"PRIVACY","version":"2026-10"}],"account_type":"COMPANY"}'
```

### GET /delivery/me

My driver profile, verification status, company, documents

```bash
curl -X GET "$BASE_URL/delivery/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /delivery/me/documents

Attach a verification document (file purpose DRIVER_DOC)

```bash
curl -X POST "$BASE_URL/delivery/me/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"doc_type":"ID_CARD","file_id":"<uuid>"}'
```

### POST /delivery/invitations/accept

Join a delivery company with an invitation token

```bash
curl -X POST "$BASE_URL/delivery/invitations/accept" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"token":"<string>"}'
```

### PATCH /delivery/me/availability

Go online / offline (going online requires a verified driver)

```bash
curl -X PATCH "$BASE_URL/delivery/me/availability" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"is_available":true}'
```

### PATCH /delivery/me/location

Update my position (throttled)

```bash
curl -X PATCH "$BASE_URL/delivery/me/location" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"latitude":36.7538,"longitude":3.0588}'
```

### GET /delivery/jobs/available

Job board

```bash
curl -X GET "$BASE_URL/delivery/jobs/available" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /delivery/jobs/active

My current jobs (assigned, picked up, out for delivery, failed awaiting return)

```bash
curl -X GET "$BASE_URL/delivery/jobs/active" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /delivery/jobs/{id}

One job: full details if assigned to me, public card if still available

```bash
curl -X GET "$BASE_URL/delivery/jobs/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /delivery/jobs/{id}/accept

Accept a job (first come, first served)

```bash
curl -X POST "$BASE_URL/delivery/jobs/<id>/accept" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /delivery/jobs/{id}/release

Give a job back before pickup (reason; delivery_max_releases_per_day)

```bash
curl -X POST "$BASE_URL/delivery/jobs/<id>/release" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Panne de moto"}'
```

### POST /delivery/jobs/{id}/confirm-pickup

ASSIGNED → PICKED_UP with the pharmacy pickup code (locked after delivery_code_max_attempts)

```bash
curl -X POST "$BASE_URL/delivery/jobs/<id>/confirm-pickup" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"pickup_code":"482913"}'
```

### POST /delivery/jobs/{id}/start

PICKED_UP → OUT_FOR_DELIVERY (optional ETA)

```bash
curl -X POST "$BASE_URL/delivery/jobs/<id>/start" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"eta_minutes":25}'
```

### POST /delivery/jobs/{id}/confirm-delivery

OUT_FOR_DELIVERY → DELIVERED with exactly one proof

```bash
curl -X POST "$BASE_URL/delivery/jobs/<id>/confirm-delivery" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"delivery_code":"019284","signature_file_id":"<uuid>","photo_file_id":"<uuid>","photo_has_no_face":true}'
```

### POST /delivery/jobs/{id}/fail

PICKED_UP / OUT_FOR_DELIVERY → FAILED (reason, attempts); then bring the parcel back

```bash
curl -X POST "$BASE_URL/delivery/jobs/<id>/fail" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Patient injoignable après 3 appels","attempts":2}'
```

### POST /delivery/jobs/{id}/confirm-return

I brought the failed parcel back to the pharmacy (the pharmacy then confirms receipt)

```bash
curl -X POST "$BASE_URL/delivery/jobs/<id>/confirm-return" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /delivery/history

My finished jobs (delivered, failed, returned, cancelled)

```bash
curl -X GET "$BASE_URL/delivery/history" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /delivery/earnings

Payouts of delivered jobs per day (records only)

```bash
curl -X GET "$BASE_URL/delivery/earnings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /delivery/company

My company profile, verification status and documents

```bash
curl -X GET "$BASE_URL/delivery/company" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /delivery/company/documents

Attach a verification document (file purpose DELIVERY_COMPANY_DOC)

```bash
curl -X POST "$BASE_URL/delivery/company/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"doc_type":"COMMERCIAL_REGISTER","file_id":"<uuid>"}'
```

### GET /delivery/company/drivers

Drivers of my company

```bash
curl -X GET "$BASE_URL/delivery/company/drivers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### DELETE /delivery/company/drivers/{id}

Remove a driver from my company (not while carrying a parcel)

```bash
curl -X DELETE "$BASE_URL/delivery/company/drivers/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /delivery/company/invitations

Invite a driver by phone or email (company must be VERIFIED)

```bash
curl -X POST "$BASE_URL/delivery/company/invitations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"email":"driver@example.dz","phone":"+213661234567"}'
```

### GET /delivery/company/invitations

Driver invitations of my company

```bash
curl -X GET "$BASE_URL/delivery/company/invitations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### DELETE /delivery/company/invitations/{id}

Revoke a pending invitation

```bash
curl -X DELETE "$BASE_URL/delivery/company/invitations/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /delivery/company/reports

Activity report: volumes by status, success rate, fees, payouts, per driver

```bash
curl -X GET "$BASE_URL/delivery/company/reports" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```
