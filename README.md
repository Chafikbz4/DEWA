# DEWA — Healthcare, simplified

> ###  LIVE DEMO: **https://dewa-nu.vercel.app**

---

#  TEST ACCOUNTS FOR JUDGES

> ## Use these to sign in and test the platform.
>
> ###  PHARMACY
> **Email:** `testpharmacy@gmail.com`
> **Password:** `TestPharmcay1234//`
>
> ###  PATIENT
> **Email:** `testpatient@gmail.com`
> **Password:** `TestPatien1234//`

**How to sign in:** open **https://dewa-nu.vercel.app**, click **Sign in**, pick the
account type (**Patient** or **Pharmacy**), then paste the email + password above.
No OTP / authenticator code is needed for these accounts.

> ℹ️ The backend runs on a free Render instance that **sleeps after ~15 min idle**, so the
> very first request after a pause can take ~30–50 seconds to wake up. After that it is fast.

---

##  Suggested 2-minute test flow

1. Open **https://dewa-nu.vercel.app** → **Sign in** → **Patient** → use the patient account above.
2. Send a prescription request (the patient's address is already set to Alger).
3. In another browser tab/profile, **Sign in** → **Pharmacy** → use the pharmacy account above.
4. Open the request, view the prescription inline, and send an offer with a price.
5. Back as the patient: accept the offer, choose pickup / pay on delivery.
6. The pharmacy gets a notification; mark the order picked up → the pharmacy's revenue updates.

---

## About the project

DEWA is a bilingual (ar/fr) healthcare marketplace for Algeria that connects **patients**,
**pharmacies**, **delivery drivers**, and **delivery companies**.

- **Backend:** NestJS + Drizzle ORM on Neon PostgreSQL (hosted on Render).
- **Frontend:** Next.js (React) hosted on Vercel.
- Every API response uses a unified envelope `{ success, data, error, meta }`.
- Money is handled in integer centimes (DZD).

### Tech & docs
- Backend API docs (Swagger): **https://dewa-backend.onrender.com/docs**
- Deployment guide: [`DEPLOY.md`](DEPLOY.md)
- Backend details: [`backend/README.md`](backend/README.md)
- Frontend details: [`FRONTEND/README.md`](FRONTEND/README.md)
