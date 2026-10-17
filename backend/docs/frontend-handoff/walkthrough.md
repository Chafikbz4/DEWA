# End-to-end happy path

Register → upload prescription → offer → accept → pay → prepare → delivery → receipt, with the exact calls in order. Against a local API seeded with demo data (`DEMO_SEED_ALLOW=1 npm run db:seed:demo`) you can run the pickup variant automatically with `DEMO_PASSWORD=… npm run demo`.

```bash
export BASE_URL=http://localhost:3000
```

## 1. Patient registers and logs in

```bash
curl -X POST "$BASE_URL/auth/register/patient" -H "Content-Type: application/json" -H "Accept-Language: fr" -d '{
  "phone": "+213661234567", "password": "Str0ngPassw0rd", "first_name": "Amel", "last_name": "B.",
  "preferred_language": "fr",
  "consents": [{ "type": "TERMS", "version": "2026-10" }, { "type": "PRIVACY", "version": "2026-10" }] }'
# → 202, an SMS code is sent
curl -X POST "$BASE_URL/auth/otp/verify" -H "Content-Type: application/json" -d '{ "target": "+213661234567", "purpose": "REGISTER", "code": "123456" }'
# → tokens: keep access_token as $PATIENT and refresh_token in secure storage
```

Use the consent versions configured on the server (`CONSENT_TERMS_VERSION` / `CONSENT_PRIVACY_VERSION`). The exact OTP body is in [02-auth §4](../api/02-auth.md#4-otp).

## 2. Address and prescription

```bash
curl -X POST "$BASE_URL/patients/me/addresses" -H "Authorization: Bearer $PATIENT" -H "Content-Type: application/json" \
  -d '{ "wilaya_id": 16, "commune_id": 554, "street_line": "5 Rue Larbi Ben Mhidi", "latitude": 36.7552, "longitude": 3.0601 }'
curl -X POST "$BASE_URL/files/upload" -H "Authorization: Bearer $PATIENT" -F "purpose=PRESCRIPTION" -F "files=@ordonnance.jpg"
# → [{ id: FILE_ID, … }]
```

## 3. Request to nearby pharmacies

```bash
curl -X POST "$BASE_URL/requests/preview-matching" -H "Authorization: Bearer $PATIENT" -H "Content-Type: application/json" \
  -d '{ "address_id": "ADDRESS_ID", "delivery_wanted": true }'
curl -X POST "$BASE_URL/requests" -H "Authorization: Bearer $PATIENT" -H "Content-Type: application/json" -d '{
  "request_type": "PRESCRIPTION", "file_ids": ["FILE_ID"], "address_id": "ADDRESS_ID",
  "delivery_wanted": true, "consent_to_share": true, "items": [{ "raw_name": "Augmentin 1 g", "quantity": 1 }] }'
# → REQUEST_ID; pharmacies get REQUEST_RECEIVED
```

## 4. Pharmacist answers with an offer

```bash
curl "$BASE_URL/pharmacy/requests?status=AWAITING_PHARMACY_RESPONSE" -H "Authorization: Bearer $PHARMACIST"
curl -X POST "$BASE_URL/pharmacy/requests/REQUEST_ID/offers" -H "Authorization: Bearer $PHARMACIST" -H "Content-Type: application/json" -d '{
  "items": [{ "request_item_id": "ITEM_ID", "name": "Augmentin 1 g", "quantity_offered": 1, "unit_price_centimes": 85000, "availability": "AVAILABLE" }],
  "delivery_available": true, "preparation_minutes": 20 }'
curl -X POST "$BASE_URL/pharmacy/offers/OFFER_ID/send" -H "Authorization: Bearer $PHARMACIST"
# → the patient gets offer.new + OFFER_RECEIVED; the delivery fee is computed by the server
```

## 5. Patient compares and accepts

```bash
curl "$BASE_URL/requests/REQUEST_ID/offers/compare" -H "Authorization: Bearer $PATIENT"
curl -X POST "$BASE_URL/offers/OFFER_ID/accept" -H "Authorization: Bearer $PATIENT" -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" -d '{ "fulfillment_type": "DELIVERY" }'
# → ORDER (PHARMACIST_VALIDATION_PENDING in the default validation-first workflow)
```

## 6. Pharmacist validates

```bash
curl -X POST "$BASE_URL/pharmacy/orders/ORDER_ID/validate" -H "Authorization: Bearer $PHARMACIST" -H "Content-Type: application/json" \
  -d '{ "decision": "APPROVE", "confirm": true, "note": "Ordonnance conforme." }'
# → AWAITING_PAYMENT, with a payment deadline
```

## 7. Patient pays

```bash
curl "$BASE_URL/orders/ORDER_ID/checkout" -H "Authorization: Bearer $PATIENT"
curl -X POST "$BASE_URL/orders/ORDER_ID/pay" -H "Authorization: Bearer $PATIENT" -H "Idempotency-Key: $(uuidgen)"
# → { payment_id, redirect_url } – open redirect_url in a webview
# dev only – simulate the bank (provider order id = last segment of redirect_url):
curl -X POST "$BASE_URL/payments/mock/PROVIDER_ORDER_ID/simulate" -H "Content-Type: application/json" -d '{ "result": "PAID" }'
curl "$BASE_URL/payments/PAYMENT_ID/status" -H "Authorization: Bearer $PATIENT"
# poll until "CONFIRMED" → order PAYMENT_CONFIRMED, receipt issued
```

## 8. Pharmacy prepares

```bash
curl -X POST "$BASE_URL/pharmacy/orders/ORDER_ID/start-preparing" -H "Authorization: Bearer $PHARMACIST"
curl -X POST "$BASE_URL/pharmacy/orders/ORDER_ID/ready" -H "Authorization: Bearer $PHARMACIST"
# delivery order → a delivery job is created; the pharmacy gets PICKUP_CODE, the patient DELIVERY_CODE
```

## 9. Driver delivers

```bash
curl "$BASE_URL/delivery/jobs/available?radius_km=20" -H "Authorization: Bearer $DRIVER"
curl -X POST "$BASE_URL/delivery/jobs/JOB_ID/accept" -H "Authorization: Bearer $DRIVER"
curl -X POST "$BASE_URL/pharmacy/orders/ORDER_ID/delivery/pickup-code" -H "Authorization: Bearer $PHARMACIST"   # code shown to the driver
curl -X POST "$BASE_URL/delivery/jobs/JOB_ID/confirm-pickup" -H "Authorization: Bearer $DRIVER" -H "Content-Type: application/json" -d '{ "pickup_code": "482913" }'
curl -X POST "$BASE_URL/delivery/jobs/JOB_ID/start" -H "Authorization: Bearer $DRIVER" -H "Content-Type: application/json" -d '{ "eta_minutes": 25 }'
curl "$BASE_URL/orders/ORDER_ID/delivery" -H "Authorization: Bearer $PATIENT"                                     # live tracking
curl -X POST "$BASE_URL/delivery/jobs/JOB_ID/confirm-delivery" -H "Authorization: Bearer $DRIVER" -H "Content-Type: application/json" -d '{ "delivery_code": "019284" }'
# → delivery DELIVERED, order DELIVERED
```

Pickup variant: instead of step 9, the patient shows a collection code (`POST /orders/ORDER_ID/collection-code`) and the pharmacy calls `POST /pharmacy/orders/ORDER_ID/handover { collection_code }` → `COMPLETED`.

## 10. Receipt

```bash
curl "$BASE_URL/orders/ORDER_ID/receipt" -H "Authorization: Bearer $PATIENT"
curl "$BASE_URL/orders/ORDER_ID/receipt?format=pdf" -H "Authorization: Bearer $PATIENT" -o recu.pdf
curl "$BASE_URL/orders/ORDER_ID/timeline" -H "Authorization: Bearer $PATIENT" -H "Accept-Language: ar"
```

Prerequisites on a fresh database:
- the pharmacy and the driver are VERIFIED (admin verification, or the demo seed);
- the PRESCRIPTION eligibility policy is enabled with a legal basis (demo: "DEMO ONLY");
- for delivery: `delivery_enabled = true`, plus a delivery zone and a fee rule that cover the address.
