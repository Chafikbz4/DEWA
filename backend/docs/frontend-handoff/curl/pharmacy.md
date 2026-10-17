# cURL – Pharmacy (generated)

`export BASE_URL=http://localhost:3000 TOKEN=<access_token>`. Bodies are minimal examples built from the OpenAPI schemas – replace `<…>` placeholders. 57 endpoints.

### GET /pharmacy/stock

My stock (all staff)

```bash
curl -X GET "$BASE_URL/pharmacy/stock" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### PUT /pharmacy/stock/{medicineId}

Set stock for a medicine (all staff, upsert)

```bash
curl -X PUT "$BASE_URL/pharmacy/stock/<medicineId>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"stock_status":"IN_STOCK"}'
```

### DELETE /pharmacy/stock/{medicineId}

Remove a stock line (OWNER, PHARMACIST)

```bash
curl -X DELETE "$BASE_URL/pharmacy/stock/<medicineId>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/stock/import

Bulk stock import from CSV (OWNER, PHARMACIST)

```bash
curl -X POST "$BASE_URL/pharmacy/stock/import" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -F "purpose=PRESCRIPTION" -F "files=@./ordonnance.jpg"
```

### POST /pharmacy/requests/{id}/offers

Create a DRAFT offer (all staff; substitutions OWNER/PHARMACIST only)

```bash
curl -X POST "$BASE_URL/pharmacy/requests/<id>/offers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"name":"Doliprane 1000mg boîte de 8","quantity_offered":2,"unit_price_centimes":25000,"availability":"AVAILABLE"}],"delivery_available":false}'
```

### GET /pharmacy/offers

My pharmacy offers

```bash
curl -X GET "$BASE_URL/pharmacy/offers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /pharmacy/offers/{id}

Offer detail

```bash
curl -X GET "$BASE_URL/pharmacy/offers/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### PATCH /pharmacy/offers/{id}

Replace a DRAFT offer (same body as create)

```bash
curl -X PATCH "$BASE_URL/pharmacy/offers/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"name":"Doliprane 1000mg boîte de 8","quantity_offered":2,"unit_price_centimes":25000,"availability":"AVAILABLE"}],"delivery_available":false}'
```

### POST /pharmacy/offers/{id}/send

Send the offer to the patient

```bash
curl -X POST "$BASE_URL/pharmacy/offers/<id>/send" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/offers/{id}/withdraw

Withdraw a DRAFT or SENT offer

```bash
curl -X POST "$BASE_URL/pharmacy/offers/<id>/withdraw" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacies/{id}/staff/invite

Invite a pharmacist or assistant (owner only)

```bash
curl -X POST "$BASE_URL/pharmacies/<id>/staff/invite" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"staff_role":"PHARMACIST"}'
```

### GET /pharmacies/{id}/staff/invitations

List invitations of the pharmacy (owner only)

```bash
curl -X GET "$BASE_URL/pharmacies/<id>/staff/invitations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### DELETE /pharmacies/{id}/staff/invitations/{invitationId}

Revoke a pending invitation (owner only)

```bash
curl -X DELETE "$BASE_URL/pharmacies/<id>/staff/invitations/<invitationId>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /pharmacy/me

My pharmacy (any staff role; also while pending verification)

```bash
curl -X GET "$BASE_URL/pharmacy/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### PATCH /pharmacy/me

Update my pharmacy (OWNER)

```bash
curl -X PATCH "$BASE_URL/pharmacy/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"name_fr":"Pharmacie El Amel","name_ar":"صيدلية الأمل","legal_name":"<string>","authorization_number":"<string>","tax_id_nif":"<string>","commercial_register_rc":"<string>","wilaya_id":16,"commune_id":554,"address_line":"<string>","latitude":1,"longitude":1,"phone":"+21321000000","email":"<string>","delivery_available":true,"accepts_requests":true}'
```

### GET /pharmacy/opening-hours

Weekly opening hours

```bash
curl -X GET "$BASE_URL/pharmacy/opening-hours" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### PUT /pharmacy/opening-hours

Replace the weekly opening hours (OWNER, PHARMACIST)

```bash
curl -X PUT "$BASE_URL/pharmacy/opening-hours" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"days":[{"day_of_week":1,"is_closed":true,"is_24h":true}]}'
```

### GET /pharmacy/on-duty

Upcoming on-duty (garde) periods

```bash
curl -X GET "$BASE_URL/pharmacy/on-duty" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/on-duty

Add an on-duty period (OWNER, PHARMACIST)

```bash
curl -X POST "$BASE_URL/pharmacy/on-duty" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"date_from":"2026-10-20T20:00:00Z","date_to":"2026-10-21T08:00:00Z"}'
```

### DELETE /pharmacy/on-duty/{id}

Delete an on-duty period (OWNER, PHARMACIST)

```bash
curl -X DELETE "$BASE_URL/pharmacy/on-duty/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /pharmacy/service-areas

Service areas (where the pharmacy receives requests / delivers)

```bash
curl -X GET "$BASE_URL/pharmacy/service-areas" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/service-areas

Add a service area (OWNER)

```bash
curl -X POST "$BASE_URL/pharmacy/service-areas" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"wilaya_id":16}'
```

### PUT /pharmacy/service-areas/{id}

Replace a service area (OWNER)

```bash
curl -X PUT "$BASE_URL/pharmacy/service-areas/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"wilaya_id":16}'
```

### DELETE /pharmacy/service-areas/{id}

Delete a service area (OWNER)

```bash
curl -X DELETE "$BASE_URL/pharmacy/service-areas/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /pharmacy/payout-accounts

Payout accounts (OWNER) – numbers always masked

```bash
curl -X GET "$BASE_URL/pharmacy/payout-accounts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/payout-accounts

Add a payout account (OWNER)

```bash
curl -X POST "$BASE_URL/pharmacy/payout-accounts" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"account_type":"BANK","holder_name":"EURL Pharmacie El Amel","account_number":"00799999001234567890"}'
```

### DELETE /pharmacy/payout-accounts/{id}

Remove a payout account (OWNER)

```bash
curl -X DELETE "$BASE_URL/pharmacy/payout-accounts/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /pharmacy/verification

Verification status, rejection reason, documents and what is missing

```bash
curl -X GET "$BASE_URL/pharmacy/verification" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/verification/submit

(Re)submit for verification (OWNER)

```bash
curl -X POST "$BASE_URL/pharmacy/verification/submit" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /pharmacy/documents

Verification documents (OWNER, PHARMACIST)

```bash
curl -X GET "$BASE_URL/pharmacy/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/documents

Attach a document (OWNER)

```bash
curl -X POST "$BASE_URL/pharmacy/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"doc_type":"AUTHORIZATION","file_id":"<uuid>"}'
```

### DELETE /pharmacy/documents/{id}

Remove a pending/rejected document (OWNER)

```bash
curl -X DELETE "$BASE_URL/pharmacy/documents/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /pharmacy/staff

List staff (OWNER)

```bash
curl -X GET "$BASE_URL/pharmacy/staff" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/staff/invite

Invite a pharmacist or assistant (OWNER)

```bash
curl -X POST "$BASE_URL/pharmacy/staff/invite" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"staff_role":"PHARMACIST"}'
```

### PATCH /pharmacy/staff/{staffId}

Change role / deactivate a staff member (OWNER)

```bash
curl -X PATCH "$BASE_URL/pharmacy/staff/<staffId>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"staff_role":"PHARMACIST","is_active":true,"pharmacist_license_number":"PH-16-01234"}'
```

### GET /pharmacy/requests

Requests received by my pharmacy (all staff)

```bash
curl -X GET "$BASE_URL/pharmacy/requests" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /pharmacy/requests/{id}

Request detail (all staff)

```bash
curl -X GET "$BASE_URL/pharmacy/requests/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/requests/{id}/accept-interest

Signal interest (all staff)

```bash
curl -X POST "$BASE_URL/pharmacy/requests/<id>/accept-interest" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/requests/{id}/decline

Decline the request (OWNER, PHARMACIST)

```bash
curl -X POST "$BASE_URL/pharmacy/requests/<id>/decline" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Médicament en rupture"}'
```

### POST /pharmacy/requests/{id}/clarification

Ask the patient a question (OWNER, PHARMACIST)

```bash
curl -X POST "$BASE_URL/pharmacy/requests/<id>/clarification" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"question":"Le dosage de la ligne 2 est illisible, pouvez-vous préciser ?"}'
```

### GET /pharmacy/reports/summary

Activity summary (OWNER, PHARMACIST)

```bash
curl -X GET "$BASE_URL/pharmacy/reports/summary" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /pharmacy/settlements

Settlement records (OWNER)

```bash
curl -X GET "$BASE_URL/pharmacy/settlements" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /pharmacy/orders

Orders of my pharmacy (all staff)

```bash
curl -X GET "$BASE_URL/pharmacy/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /pharmacy/orders/{id}

Order detail (pharmacy view: patient first name, delivery area only)

```bash
curl -X GET "$BASE_URL/pharmacy/orders/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /pharmacy/orders/{id}/timeline

Order timeline

```bash
curl -X GET "$BASE_URL/pharmacy/orders/<id>/timeline" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/orders/{id}/validate

Pharmacist validation (OWNER/PHARMACIST only)

```bash
curl -X POST "$BASE_URL/pharmacy/orders/<id>/validate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"decision":"APPROVE","confirm":true,"note":"Ordonnance conforme, posologie vérifiée."}'
```

### POST /pharmacy/orders/{id}/start-preparing

PAYMENT_CONFIRMED → PREPARING (validation-first)

```bash
curl -X POST "$BASE_URL/pharmacy/orders/<id>/start-preparing" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/orders/{id}/ready

PREPARING → READY_FOR_PICKUP

```bash
curl -X POST "$BASE_URL/pharmacy/orders/<id>/ready" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/orders/{id}/handover

Pickup hand-over: READY_FOR_PICKUP → COMPLETED with the patient collection code (5 attempts)

```bash
curl -X POST "$BASE_URL/pharmacy/orders/<id>/handover" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"collection_code":"482913"}'
```

### POST /pharmacy/orders/{id}/cancel

Cancel an order (OWNER/PHARMACIST) – refund flow when already paid

```bash
curl -X POST "$BASE_URL/pharmacy/orders/<id>/cancel" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Je n’en ai plus besoin"}'
```

### POST /pharmacy/orders/{id}/refund-request

Request a partial refund (e.g. item unavailable after payment) – OWNER/PHARMACIST

```bash
curl -X POST "$BASE_URL/pharmacy/orders/<id>/refund-request" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Article indisponible après paiement"}'
```

### GET /pharmacy/orders/{id}/delivery

Delivery of one of my orders (driver first name, vehicle, plate, timestamps)

```bash
curl -X GET "$BASE_URL/pharmacy/orders/<id>/delivery" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/orders/{id}/delivery/pickup-code

New pickup code to show the driver (shown once; resets attempts)

```bash
curl -X POST "$BASE_URL/pharmacy/orders/<id>/delivery/pickup-code" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/orders/{id}/delivery/confirm-return

Confirm the failed parcel is back: delivery RETURNED, order FAILED → REFUND_PENDING (automatic refund request)

```bash
curl -X POST "$BASE_URL/pharmacy/orders/<id>/delivery/confirm-return" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /pharmacy/complaints

Complaints against my pharmacy (OWNER, PHARMACIST)

```bash
curl -X GET "$BASE_URL/pharmacy/complaints" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /pharmacy/complaints/{id}

Complaint detail (OWNER, PHARMACIST)

```bash
curl -X GET "$BASE_URL/pharmacy/complaints/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /pharmacy/complaints/{id}/reply

Reply to a complaint (OWNER, PHARMACIST)

```bash
curl -X POST "$BASE_URL/pharmacy/complaints/<id>/reply" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"body":"<string>"}'
```
