# cURL – Patient (generated)

`export BASE_URL=http://localhost:3000 TOKEN=<access_token>`. Bodies are minimal examples built from the OpenAPI schemas – replace `<…>` placeholders. 49 endpoints.

### POST /requests/preview-matching

Preview which pharmacies would receive the request

```bash
curl -X POST "$BASE_URL/requests/preview-matching" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"address_id":"<uuid>","delivery_wanted":false}'
```

### POST /requests

Submit a request (PRESCRIPTION, CHIFA or PRODUCT)

```bash
curl -X POST "$BASE_URL/requests" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"address_id":"<uuid>","delivery_wanted":false,"request_type":"PRESCRIPTION","consent_to_share":true}'
```

### GET /requests

My requests

```bash
curl -X GET "$BASE_URL/requests" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /requests/{id}

Request detail

```bash
curl -X GET "$BASE_URL/requests/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /requests/{id}/cancel

Cancel a request

```bash
curl -X POST "$BASE_URL/requests/<id>/cancel" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Trouvé en pharmacie"}'
```

### POST /requests/{id}/items

Add an item

```bash
curl -X POST "$BASE_URL/requests/<id>/items" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"raw_name":"Doliprane 1000mg"}'
```

### PATCH /requests/{id}/items/{itemId}

Edit an item (e.g. correct an OCR suggestion)

```bash
curl -X PATCH "$BASE_URL/requests/<id>/items/<itemId>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"raw_name":"Doliprane 1000mg","medicine_id":"<uuid>","quantity":2,"dosage_text":"1 comprimé matin et soir"}'
```

### DELETE /requests/{id}/items/{itemId}

Remove an item

```bash
curl -X DELETE "$BASE_URL/requests/<id>/items/<itemId>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /patients/me

My patient profile

```bash
curl -X GET "$BASE_URL/patients/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### PATCH /patients/me

Update my profile

```bash
curl -X PATCH "$BASE_URL/patients/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Amina","last_name":"Benali","date_of_birth":"1990-04-21","gender":"MALE","national_id":"109900123456789012","preferred_language":"ar"}'
```

### GET /patients/me/addresses

List my saved addresses

```bash
curl -X GET "$BASE_URL/patients/me/addresses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /patients/me/addresses

Add an address

```bash
curl -X POST "$BASE_URL/patients/me/addresses" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"wilaya_id":16,"commune_id":554,"street_line":"12 Rue Didouche Mourad"}'
```

### GET /patients/me/addresses/{id}

Get one of my addresses

```bash
curl -X GET "$BASE_URL/patients/me/addresses/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### PATCH /patients/me/addresses/{id}

Update an address

```bash
curl -X PATCH "$BASE_URL/patients/me/addresses/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"label":"Maison","wilaya_id":16,"commune_id":554,"street_line":"12 Rue Didouche Mourad","building_details":"Bât. B, 3e étage, porte gauche","latitude":36.7538,"longitude":3.0588,"phone_contact":"+213661234567","delivery_notes":"Sonner deux fois","is_default":true}'
```

### DELETE /patients/me/addresses/{id}

Delete an address (soft delete)

```bash
curl -X DELETE "$BASE_URL/patients/me/addresses/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /patients/me/addresses/{id}/default

Make this my default address

```bash
curl -X POST "$BASE_URL/patients/me/addresses/<id>/default" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /patients/me/dependants

List my dependants

```bash
curl -X GET "$BASE_URL/patients/me/dependants" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /patients/me/dependants

Declare a dependant

```bash
curl -X POST "$BASE_URL/patients/me/dependants" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Yanis","last_name":"Benali","relationship":"CHILD"}'
```

### GET /patients/me/dependants/{id}

Get a dependant

```bash
curl -X GET "$BASE_URL/patients/me/dependants/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### PATCH /patients/me/dependants/{id}

Update a dependant

```bash
curl -X PATCH "$BASE_URL/patients/me/dependants/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Yanis","last_name":"Benali","date_of_birth":"2018-09-02","relationship":"CHILD","proof_file_id":"<uuid>"}'
```

### DELETE /patients/me/dependants/{id}

Remove a dependant (soft delete)

```bash
curl -X DELETE "$BASE_URL/patients/me/dependants/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /requests/{id}/offers

Offers received for my request (cheapest first, drafts never shown)

```bash
curl -X GET "$BASE_URL/requests/<id>/offers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /requests/{id}/offers/compare

Compare sent offers

```bash
curl -X GET "$BASE_URL/requests/<id>/offers/compare" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /offers/{id}

Offer detail (patient)

```bash
curl -X GET "$BASE_URL/offers/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /offers/{id}/items/{itemId}/approval

Approve or reject a proposed substitution

```bash
curl -X POST "$BASE_URL/offers/<id>/items/<itemId>/approval" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"decision":"APPROVED"}'
```

### POST /pharmacies/register

Register a pharmacy (owner + pharmacy in PENDING_VERIFICATION)

```bash
curl -X POST "$BASE_URL/pharmacies/register" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"password":"Str0ngPassw0rd","first_name":"Amina","last_name":"Benali","preferred_language":"fr","consents":[{"type":"TERMS","version":"2026-10"},{"type":"PRIVACY","version":"2026-10"}],"pharmacy":{"name_fr":"Pharmacie El Amel","name_ar":"صيدلية الأمل","authorization_number":"AUT-16-2019-0457","wilaya_id":16,"commune_id":554,"address_line":"12 Rue Didouche Mourad"}}'
```

### GET /pharmacies/nearby

Verified pharmacies near a point (public)

```bash
curl -X GET "$BASE_URL/pharmacies/nearby?lat=<lat>&lng=<lng>" \
  -H "Accept-Language: fr"
```

### POST /offers/{id}/accept

Accept an offer → creates the order

```bash
curl -X POST "$BASE_URL/offers/<id>/accept" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"fulfillment_type":"DELIVERY"}'
```

### GET /orders

My orders

```bash
curl -X GET "$BASE_URL/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /orders/{id}

Order detail (full patient view, incl. next_actions)

```bash
curl -X GET "$BASE_URL/orders/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /orders/{id}/timeline

Order timeline with localized labels

```bash
curl -X GET "$BASE_URL/orders/<id>/timeline" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /orders/{id}/cancel

Cancel my order

```bash
curl -X POST "$BASE_URL/orders/<id>/cancel" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Je n’en ai plus besoin"}'
```

### POST /orders/{id}/collection-code

Get a new collection code (pickup orders, READY_FOR_PICKUP)

```bash
curl -X POST "$BASE_URL/orders/<id>/collection-code" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /orders/{id}/checkout

Checkout summary

```bash
curl -X GET "$BASE_URL/orders/<id>/checkout" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /orders/{id}/pay

Start paying (redirect to the hosted payment page)

```bash
curl -X POST "$BASE_URL/orders/<id>/pay" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Idempotency-Key: $(uuidgen)"
```

### GET /orders/{id}/payments

Payments of my order

```bash
curl -X GET "$BASE_URL/orders/<id>/payments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /payments/{id}/status

Payment status (poll after the redirect)

```bash
curl -X GET "$BASE_URL/payments/<id>/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /orders/{id}/receipt

Receipt (JSON, or PDF with ?format=pdf)

```bash
curl -X GET "$BASE_URL/orders/<id>/receipt" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /orders/{id}/refund-request

Request a (partial) refund

```bash
curl -X POST "$BASE_URL/orders/<id>/refund-request" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Article indisponible après paiement"}'
```

### GET /orders/{id}/refunds

Refunds of my order

```bash
curl -X GET "$BASE_URL/orders/<id>/refunds" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /payments/webhook/{provider}

Provider webhook

```bash
curl -X POST "$BASE_URL/payments/webhook/<provider>" \
  -H "Accept-Language: fr"
```

### GET /payments/return/{paymentId}

Browser return URL from the hosted page

```bash
curl -X GET "$BASE_URL/payments/return/<paymentId>" \
  -H "Accept-Language: fr"
```

### POST /payments/mock/{providerOrderId}/simulate

[DEV/TEST] Simulate the bank result on the mock gateway

```bash
curl -X POST "$BASE_URL/payments/mock/<providerOrderId>/simulate" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"result":"PAID"}'
```

### GET /orders/{id}/delivery

Track my delivery

```bash
curl -X GET "$BASE_URL/orders/<id>/delivery" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /orders/{id}/delivery/code

Get a new delivery code to give the driver (shown once; resets attempts)

```bash
curl -X POST "$BASE_URL/orders/<id>/delivery/code" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /complaints

File a complaint

```bash
curl -X POST "$BASE_URL/complaints" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"against_type":"PHARMACY","category":"ORDER_NOT_RECEIVED","description":"La commande est arrivée incomplète."}'
```

### GET /complaints

Complaints I filed

```bash
curl -X GET "$BASE_URL/complaints" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /complaints/{id}

One of my complaints with its messages

```bash
curl -X GET "$BASE_URL/complaints/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /complaints/{id}/messages

Add a message to my complaint

```bash
curl -X POST "$BASE_URL/complaints/<id>/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"body":"<string>"}'
```
