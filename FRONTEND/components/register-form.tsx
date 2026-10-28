"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Icon } from "@/components/platform";
import { api } from "@/lib/api";

const copy = {
  patient: { label: "PATIENT ACCOUNT", title: "Start your healthcare journey.", description: "Create an account to send a prescription and find your medication.", fields: ["First name", "Last name", "Phone"] },
  pharmacist: { label: "PHARMACY SPACE", title: "Grow your pharmacy with DEWA.", description: "Register your pharmacy and receive patient requests in your area.", fields: ["Owner name", "Pharmacy name", "Phone"] },
  driver: { label: "DRIVER SPACE", title: "Deliver with flexibility and confidence.", description: "Join the DEWA network and access delivery jobs near you.", fields: ["Full name", "Phone", "Wilaya"] },
  company: { label: "COMPANY SPACE", title: "Manage your deliveries with DEWA.", description: "Create your company workspace and coordinate your driver team.", fields: ["Owner name", "Phone", "Company name"] },
} as const;

export default function RegisterForm({ role: requestedRole }: { role: string }) {
  const role = requestedRole in copy ? requestedRole as keyof typeof copy : "patient";
  const details = copy[role];
  const [submitted, setSubmitted] = useState(false);
  const [otpSent, setOtpSent] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [wilayas, setWilayas] = useState<Record<string, unknown>[]>([]);
  const [communes, setCommunes] = useState<Record<string, unknown>[]>([]);
  const [wilayaId, setWilayaId] = useState("");
  const [communeId, setCommuneId] = useState("");
  const [loadingLocation, setLoadingLocation] = useState(role === "pharmacist");

  function records(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
    if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      for (const key of ["items", "data", "results"]) if (Array.isArray(object[key])) return records(object[key]);
    }
    return [];
  }

  useEffect(() => {
    if (role !== "pharmacist") return;
    api.wilayas().then((value) => {
      const items = records(value);
      setWilayas(items);
      if (items.length) setWilayaId(String(items[0].id));
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load Wilayas.")).finally(() => setLoadingLocation(false));
  }, [role]);

  useEffect(() => {
    if (role !== "pharmacist" || !wilayaId) return;
    api.communes(Number(wilayaId)).then((value) => {
      const items = records(value);
      setCommunes(items);
      setCommuneId(items.length ? String(items[0].id) : "");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load communes."));
  }, [role, wilayaId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const common = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      first_name: String(form.get("first_name") ?? ""),
      last_name: String(form.get("last_name") ?? ""),
      preferred_language: "fr",
      consents: [{ type: "TERMS", version: "2026-10" }, { type: "PRIVACY", version: "2026-10" }],
    };
    const phone = String(form.get("phone") ?? "").trim();
    if (phone) Object.assign(common, { phone });
    try {
      let result: { target_masked?: string; otp_sent?: boolean } | undefined;
      if (role === "patient") result = await api.registerPatient(common);
      if (role === "pharmacist") result = await api.registerPharmacy({
        ...common,
        pharmacy: {
          name_fr: String(form.get("pharmacy_name") ?? ""),
          name_ar: String(form.get("pharmacy_name") ?? ""),
          authorization_number: String(form.get("authorization_number") ?? ""),
          wilaya_id: Number(form.get("wilaya_id")),
          commune_id: Number(form.get("commune_id")),
          address_line: String(form.get("address_line") ?? ""),
        },
      });
      if (role === "driver") result = await api.registerDriver({ ...common, account_type: "DRIVER", vehicle_type: String(form.get("vehicle_type") ?? "MOTORCYCLE") });
      if (role === "company") result = await api.registerCompany({ ...common, account_type: "COMPANY", company: { name: String(form.get("company_name") ?? "") } });
      setOtpSent(result?.otp_sent !== false);
      setSubmitted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create the account.");
    } finally {
      setLoading(false);
    }
  }
  return <main className="register-page"><div className="register-visual"><Link href="/" className="landing-brand"><span className="platform-logo">+</span>dewa</Link><div><span className="landing-kicker">WELCOME TO DEWA</span><h1>Healthcare works better when everyone is connected.</h1><p>One Algerian platform bringing patients, pharmacies, and delivery professionals together.</p></div><Link href="/" className="register-back">← Back to home</Link></div><div className="register-form-side"><div className="register-form-wrap"><Link href="/" className="register-mobile-brand landing-brand"><span className="platform-logo">+</span>dewa</Link>{submitted ? (otpSent ? <div className="register-success"><span className="success-mark">✓</span><span className="landing-kicker">REQUEST RECEIVED</span><h2>Check your email</h2><p>We sent you a one-time code. Use it to activate your account.</p><Link href="/verify" className="platform-primary">Enter OTP code <Icon name="arrow" size={16} /></Link></div> : <div className="register-success"><span className="success-mark">✓</span><span className="landing-kicker">ACCOUNT READY</span><h2>You're all set</h2><p>Your account has been created and is active. You can sign in right away.</p><Link href="/login" className="platform-primary">Sign in <Icon name="arrow" size={16} /></Link></div>) : <><span className="landing-kicker">{details.label}</span><h2>{details.title}</h2><p>{details.description}</p><form onSubmit={submit}><label>First name<input name="first_name" required placeholder="First name" /></label><label>Last name<input name="last_name" required placeholder="Last name" /></label>{role === "pharmacist" ? <><label>Pharmacy name<input name="pharmacy_name" required placeholder="El Amel Pharmacy" /></label><label>Authorization number<input name="authorization_number" required placeholder="AUT-16-2019-0457" /></label><label>Street address<input name="address_line" required placeholder="Pharmacy street address" /></label><label>Wilaya<select name="wilaya_id" required value={wilayaId} disabled={loadingLocation} onChange={(event) => { setWilayaId(event.target.value); setCommuneId(""); }}><option value="" disabled>Select your Wilaya</option>{wilayas.map((item) => <option value={String(item.id)} key={String(item.id)}>{String(item.id)} — {String(item.name_fr ?? item.name)}</option>)}</select></label><label>Commune<select name="commune_id" required value={communeId} disabled={loadingLocation || !communes.length} onChange={(event) => setCommuneId(event.target.value)}><option value="" disabled>Select your Commune</option>{communes.map((item) => <option value={String(item.id)} key={String(item.id)}>{String(item.name_fr ?? item.name)}</option>)}</select></label></> : role === "company" ? <label>Company name<input name="company_name" required placeholder="DEWA Delivery" /></label> : role === "driver" ? <label>Vehicle type<select name="vehicle_type" defaultValue="MOTORCYCLE"><option value="MOTORCYCLE">Motorcycle</option><option value="CAR">Car</option><option value="VAN">Van</option><option value="BIKE">Bicycle</option></select></label> : null}<label>Phone<input name="phone" placeholder="+213 5 50 12 34 56" /></label><label>Email address<input name="email" required type="email" placeholder="you@example.com" /></label><label>Password<input name="password" required type="password" minLength={10} placeholder="At least 10 characters" /></label><label className="check-row"><input type="checkbox" required /> I agree to the terms of use and privacy policy.</label>{error && <div className="form-error" role="alert">{error}</div>}<button className="platform-primary full" disabled={loading || loadingLocation}>{loading ? "Creating account..." : "Create account"} <Icon name="arrow" size={16} /></button></form><p className="register-login">Already have an account? <Link href="/login">Sign in</Link></p></>}</div></div></main>;
}
