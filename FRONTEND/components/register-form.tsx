"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
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
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const common = {
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      password: String(form.get("password") ?? ""),
      first_name: String(form.get("first_name") ?? ""),
      last_name: String(form.get("last_name") ?? ""),
      preferred_language: "fr",
      consents: [{ type: "TERMS", version: "2026-10" }, { type: "PRIVACY", version: "2026-10" }],
    };
    try {
      if (role === "patient") await api.registerPatient(common);
      if (role === "pharmacist") await api.registerPharmacy({
        ...common,
        pharmacy: {
          name_fr: String(form.get("pharmacy_name") ?? ""),
          name_ar: String(form.get("pharmacy_name") ?? ""),
          authorization_number: String(form.get("authorization_number") ?? ""),
          wilaya_id: Number(form.get("wilaya_id") ?? 16),
          commune_id: Number(form.get("commune_id") ?? 554),
          address_line: String(form.get("address_line") ?? ""),
        },
      });
      if (role === "driver") await api.registerDriver({ ...common, account_type: "DRIVER", vehicle_type: String(form.get("vehicle_type") ?? "MOTORCYCLE") });
      if (role === "company") await api.registerCompany({ ...common, account_type: "COMPANY", company: { name: String(form.get("company_name") ?? "") } });
      setSubmitted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create the account.");
    } finally {
      setLoading(false);
    }
  }
  return <main className="register-page"><div className="register-visual"><Link href="/" className="landing-brand"><span className="platform-logo">+</span>dewa</Link><div><span className="landing-kicker">WELCOME TO DEWA</span><h1>Healthcare works better when everyone is connected.</h1><p>One Algerian platform bringing patients, pharmacies, and delivery professionals together.</p></div><Link href="/" className="register-back">← Back to home</Link></div><div className="register-form-side"><div className="register-form-wrap"><Link href="/" className="register-mobile-brand landing-brand"><span className="platform-logo">+</span>dewa</Link>{submitted ? <div className="register-success"><span className="success-mark">✓</span><span className="landing-kicker">REQUEST RECEIVED</span><h2>Verify your phone</h2><p>We sent you a one-time code. Use it to activate your account.</p><Link href="/verify" className="platform-primary">Enter OTP code <Icon name="arrow" size={16} /></Link></div> : <><span className="landing-kicker">{details.label}</span><h2>{details.title}</h2><p>{details.description}</p><form onSubmit={submit}><label>First name<input name="first_name" required placeholder="First name" /></label><label>Last name<input name="last_name" required placeholder="Last name" /></label>{role === "pharmacist" ? <><label>Pharmacy name<input name="pharmacy_name" required placeholder="El Amel Pharmacy" /></label><label>Authorization number<input name="authorization_number" required placeholder="AUT-16-2019-0457" /></label><label>Address<input name="address_line" required placeholder="Pharmacy address" /></label><input type="hidden" name="wilaya_id" value="16" /><input type="hidden" name="commune_id" value="554" /></> : role === "company" ? <label>Company name<input name="company_name" required placeholder="DEWA Delivery" /></label> : role === "driver" ? <label>Vehicle type<select name="vehicle_type" defaultValue="MOTORCYCLE"><option value="MOTORCYCLE">Motorcycle</option><option value="CAR">Car</option><option value="VAN">Van</option><option value="BIKE">Bicycle</option></select></label> : null}<label>Phone<input name="phone" required placeholder="+213 5 50 12 34 56" /></label><label>Email address<input name="email" type="email" placeholder="you@example.com" /></label><label>Password<input name="password" required type="password" minLength={10} placeholder="At least 10 characters" /></label><label className="check-row"><input type="checkbox" required /> I agree to the terms of use and privacy policy.</label>{error && <div className="form-error" role="alert">{error}</div>}<button className="platform-primary full" disabled={loading}>{loading ? "Creating account..." : "Create account"} <Icon name="arrow" size={16} /></button></form><p className="register-login">Already have an account? <Link href="/login">Sign in</Link></p></>}</div></div></main>;
}
