# cURL – Auth, account, files, notifications, conversations, health (generated)

`export BASE_URL=http://localhost:3000 TOKEN=<access_token>`. Bodies are minimal examples built from the OpenAPI schemas – replace `<…>` placeholders. 52 endpoints.

### GET /health

Liveness + database connectivity

```bash
curl -X GET "$BASE_URL/health" \
  -H "Accept-Language: fr"
```

### GET /health/live

Liveness (no dependency checked)

```bash
curl -X GET "$BASE_URL/health/live" \
  -H "Accept-Language: fr"
```

### GET /ready

Readiness: database reachable and schema migrated

```bash
curl -X GET "$BASE_URL/ready" \
  -H "Accept-Language: fr"
```

### POST /files/upload

Upload files (JPEG / PNG / PDF)

```bash
curl -X POST "$BASE_URL/files/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -F "purpose=PRESCRIPTION" -F "files=@./ordonnance.jpg"
```

### GET /files/{id}

File metadata (if you may access it)

```bash
curl -X GET "$BASE_URL/files/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /files/{id}/access-url

Get a short-lived signed download link

```bash
curl -X GET "$BASE_URL/files/<id>/access-url" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /files/download/{token}

Download through a signed link (no Bearer needed)

```bash
curl -X GET "$BASE_URL/files/download/<token>" \
  -H "Accept-Language: fr"
```

### GET /geo/wilayas

List the 58 wilayas (public)

```bash
curl -X GET "$BASE_URL/geo/wilayas" \
  -H "Accept-Language: fr"
```

### GET /geo/wilayas/{id}/communes

List communes of a wilaya (public)

```bash
curl -X GET "$BASE_URL/geo/wilayas/<id>/communes" \
  -H "Accept-Language: fr"
```

### GET /notifications

My in-app notifications

```bash
curl -X GET "$BASE_URL/notifications" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /notifications/read-all

Mark all as read

```bash
curl -X POST "$BASE_URL/notifications/read-all" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /notifications/{id}/read

Mark one as read

```bash
curl -X POST "$BASE_URL/notifications/<id>/read" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /notifications/preferences

Channel preferences and muted types

```bash
curl -X GET "$BASE_URL/notifications/preferences" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### PATCH /notifications/preferences

Update channel preferences / muted types

```bash
curl -X PATCH "$BASE_URL/notifications/preferences" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"push_enabled":true,"sms_enabled":true,"email_enabled":true,"muted_types":["<string>"]}'
```

### GET /conversations

My conversations

```bash
curl -X GET "$BASE_URL/conversations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /conversations/{id}/messages

Messages (cursor pagination, newest first)

```bash
curl -X GET "$BASE_URL/conversations/<id>/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /conversations/{id}/messages

Send a message

```bash
curl -X POST "$BASE_URL/conversations/<id>/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"type":"TEXT"}'
```

### POST /conversations/{id}/read

Mark the other side’s messages as read

```bash
curl -X POST "$BASE_URL/conversations/<id>/read" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /medicines/search

Search the medicine catalog (fr / ar / DCI, typo-tolerant)

```bash
curl -X GET "$BASE_URL/medicines/search?q=<q>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /medicines/{id}

Medicine detail

```bash
curl -X GET "$BASE_URL/medicines/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /auth/login

Log in with email/phone + password

```bash
curl -X POST "$BASE_URL/auth/login" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"+213550123456","password":"Str0ngPassw0rd"}'
```

### POST /auth/login/otp

Log in with phone + SMS code

```bash
curl -X POST "$BASE_URL/auth/login/otp" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+213550123456","code":"123456"}'
```

### POST /auth/login/mfa

Second login step: TOTP code

```bash
curl -X POST "$BASE_URL/auth/login/mfa" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"mfa_token":"<string>","code":"492817"}'
```

### POST /auth/refresh

Rotate the refresh token

```bash
curl -X POST "$BASE_URL/auth/refresh" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"<string>"}'
```

### POST /auth/logout

Revoke the current session

```bash
curl -X POST "$BASE_URL/auth/logout" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /auth/logout-all

Revoke every session of the account (including this one)

```bash
curl -X POST "$BASE_URL/auth/logout-all" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /auth/sessions

List active sessions

```bash
curl -X GET "$BASE_URL/auth/sessions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### DELETE /auth/sessions/{id}

Revoke one of your sessions (e.g. a lost phone)

```bash
curl -X DELETE "$BASE_URL/auth/sessions/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /auth/register/patient

Register a patient

```bash
curl -X POST "$BASE_URL/auth/register/patient" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"password":"Str0ngPassw0rd","first_name":"Amina","last_name":"Benali","preferred_language":"fr","consents":[{"type":"TERMS","version":"2026-10"},{"type":"PRIVACY","version":"2026-10"}]}'
```

### POST /auth/register/pharmacy

Register a pharmacy owner + pharmacy (DRAFT)

```bash
curl -X POST "$BASE_URL/auth/register/pharmacy" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"password":"Str0ngPassw0rd","first_name":"Amina","last_name":"Benali","preferred_language":"fr","consents":[{"type":"TERMS","version":"2026-10"},{"type":"PRIVACY","version":"2026-10"}],"pharmacy":{"name_fr":"Pharmacie El Amel","name_ar":"صيدلية الأمل","authorization_number":"AUT-16-2019-0457","wilaya_id":16,"commune_id":554,"address_line":"12 Rue Didouche Mourad"}}'
```

### POST /auth/register/delivery-company

Register a delivery company admin + company

```bash
curl -X POST "$BASE_URL/auth/register/delivery-company" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"password":"Str0ngPassw0rd","first_name":"Amina","last_name":"Benali","preferred_language":"fr","consents":[{"type":"TERMS","version":"2026-10"},{"type":"PRIVACY","version":"2026-10"}],"company":{"name":"Yassir Express Alger"}}'
```

### POST /auth/register/driver

Register an independent driver

```bash
curl -X POST "$BASE_URL/auth/register/driver" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"password":"Str0ngPassw0rd","first_name":"Amina","last_name":"Benali","preferred_language":"fr","consents":[{"type":"TERMS","version":"2026-10"},{"type":"PRIVACY","version":"2026-10"}],"vehicle_type":"MOTORCYCLE"}'
```

### POST /auth/register/staff

Accept a pharmacy staff invitation (creates the account)

```bash
curl -X POST "$BASE_URL/auth/register/staff" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"invitation_token":"<string>","password":"Str0ngPassw0rd","first_name":"Karim","last_name":"Haddad","preferred_language":"ar","consents":[{"type":"TERMS","version":"2026-10"}]}'
```

### POST /auth/invitations/preview

Show who invited you before you register

```bash
curl -X POST "$BASE_URL/auth/invitations/preview" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"invitation_token":"<string>"}'
```

### POST /auth/otp/request

Send a 6-digit code

```bash
curl -X POST "$BASE_URL/auth/otp/request" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"target":"+213550123456","purpose":"REGISTER"}'
```

### POST /auth/otp/verify

Verify a code

```bash
curl -X POST "$BASE_URL/auth/otp/verify" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"target":"+213550123456","purpose":"REGISTER","code":"123456"}'
```

### POST /auth/password/forgot

Start a password reset

```bash
curl -X POST "$BASE_URL/auth/password/forgot" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"identifier":"amina@example.dz"}'
```

### POST /auth/password/reset

Set a new password with a reset_token

```bash
curl -X POST "$BASE_URL/auth/password/reset" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"reset_token":"<string>","new_password":"NewStr0ngPassw0rd"}'
```

### POST /auth/password/change

Change password (logged in)

```bash
curl -X POST "$BASE_URL/auth/password/change" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"current_password":"OldPassw0rd!","new_password":"NewStr0ngPassw0rd"}'
```

### POST /auth/mfa/setup

Start TOTP enrolment

```bash
curl -X POST "$BASE_URL/auth/mfa/setup" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"mfa_token":"<string>"}'
```

### POST /auth/mfa/enable

Confirm TOTP enrolment with a code

```bash
curl -X POST "$BASE_URL/auth/mfa/enable" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"code":"492817"}'
```

### POST /auth/mfa/disable

Disable TOTP (pharmacy staff only)

```bash
curl -X POST "$BASE_URL/auth/mfa/disable" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"code":"492817","password":"Str0ngPassw0rd"}'
```

### POST /auth/devices

Register this device / enable biometric login

```bash
curl -X POST "$BASE_URL/auth/devices" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"b7a3c1e0-5d1f-4c1e-9a77-2f1d5b0e8c11","platform":"android","biometric_enabled":true}'
```

### GET /auth/devices

List your registered devices

```bash
curl -X GET "$BASE_URL/auth/devices" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### DELETE /auth/devices/{id}

Remove a device (disables biometrics, revokes its sessions)

```bash
curl -X DELETE "$BASE_URL/auth/devices/<id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### GET /me

Current account

```bash
curl -X GET "$BASE_URL/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### PATCH /me

Update preferences (language)

```bash
curl -X PATCH "$BASE_URL/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"preferred_language":"ar"}'
```

### GET /me/consents

List your consent records (history included)

```bash
curl -X GET "$BASE_URL/me/consents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /me/consents

Grant a consent

```bash
curl -X POST "$BASE_URL/me/consents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"type":"TERMS","version":"2026-10"}'
```

### DELETE /me/consents/{type}

Revoke a consent

```bash
curl -X DELETE "$BASE_URL/me/consents/<type>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /me/data-export

Download all my personal data (JSON)

```bash
curl -X POST "$BASE_URL/me/data-export" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr"
```

### POST /me/delete-account

Delete my account (patients)

```bash
curl -X POST "$BASE_URL/me/delete-account" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept-Language: fr" \
  -H "Content-Type: application/json" \
  -d '{"password":"<string>","confirm":true}'
```
