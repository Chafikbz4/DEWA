# Deploy DEWA (Render + Vercel)

This hosts the **backend on Render** and the **frontend on Vercel**, reusing the existing
Neon database (schema + demo data already loaded). No secrets are stored in this repo —
you paste them in the dashboards.

Both providers need **you to be signed in** (free accounts are enough). Steps are short.

Demo logins for the team (no OTP needed): password **`DewaDemo2026x`**
- Patient: `patient@demo.dewa.dz`
- Pharmacy: `pharmacist1@demo.dewa.dz` (or `owner1@demo.dewa.dz`)
- Driver: `driver@demo.dewa.dz` · Company: `company@demo.dewa.dz`
- Admin: `super@demo.dewa.dz` (sets up an authenticator app on first login)

---

## 1. Backend on Render (do this first)

1. Go to https://dashboard.render.com → **New → Blueprint**.
2. Connect the GitHub repo `Chafikbz4/DEWA` and select it. Render reads `render.yaml`
   and proposes the service **dewa-backend**. Click **Apply**.
3. It will ask for the secret env vars (marked "sync:false"). Paste these from
   `backend/.env` on your machine:
   - `DATABASE_URL` → the Neon pooled URL (the `...-pooler...` one)
   - `DATABASE_URL_UNPOOLED` → the Neon direct URL
   - `ENCRYPTION_KEY` → copy the exact value from `backend/.env`
     (it must stay the same as the one that created the data).
4. Click **Create / Deploy**. First build takes a few minutes.
5. When it is **Live**, note the URL, e.g. `https://dewa-backend.onrender.com`.
   Check it: open `https://dewa-backend.onrender.com/health` (should say `"status":"ok"`),
   and the API docs at `https://dewa-backend.onrender.com/docs`.

Notes:
- The free Render service **sleeps after ~15 min idle**; the first request then takes
  ~30–50 s to wake. Fine for a demo.
- `CORS_ORIGINS` is `*` for the demo so the Vercel site can call it. Set it to the exact
  Vercel URL later if you want to lock it down.

---

## 2. Frontend on Vercel

1. Go to https://vercel.com/new → import the same GitHub repo `Chafikbz4/DEWA`.
2. In the import screen set:
   - **Root Directory**: `FRONTEND`
   - **Framework Preset**: Next.js (auto-detected)
3. Add an **Environment Variable**:
   - `NEXT_PUBLIC_API_URL` = your Render backend URL from step 1
     (e.g. `https://dewa-backend.onrender.com`, no trailing slash)
4. Click **Deploy**. You get a URL like `https://dewa-xxxx.vercel.app`.

That Vercel URL is the link to share with the team.

---

## 3. Quick test after deploy

1. Open the Vercel URL → **Sign in** → choose **Patient** → `patient@demo.dewa.dz` / `DewaDemo2026x`.
2. In another browser/profile, sign in as **Pharmacy** → `pharmacist1@demo.dewa.dz`.
3. Patient: send a request; Pharmacy: open it, see the prescription inline, accept with an
   amount; Patient: choose pickup + pay on delivery; Pharmacy: gets a notification and marks
   it picked up → revenue updates.

---

## Going to real production later (not needed for the demo)

- Set `NODE_ENV=production` and configure **real SMS/email providers** (the app refuses the
  console providers in production) and a real malware scanner.
- Set `CORS_ORIGINS` to the exact frontend URL.
- Move secrets to a managed secret store; rotate the demo secrets.
- Replace the mock payment provider with the SATIM/Edahabia integration.
- See `backend/docs/10-security-review.md` and `backend/docs/11-compliance-open-questions.md`.
