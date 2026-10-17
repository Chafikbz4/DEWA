"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api, getSession, setSession } from "@/lib/api";
import { Icon } from "@/components/platform";

export default function VerifyPage() {
  const [target, setTarget] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const session = await api.verifyOtp({ target, purpose: "REGISTER", code });
      setSession(session);
      setVerified(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Code invalide.");
    }
  }
  const destination = () => {
    const role = getSession()?.user?.role.toUpperCase() ?? "";
    return role.includes("ADMIN") ? "/admin" : role.includes("PHARMACY") ? "/pharmacy" : role === "DRIVER" ? "/delivery" : role.includes("DELIVERY_COMPANY") ? "/company" : "/patient";
  };
  return <main className="auth-page"><div className="auth-card"><Link href="/" className="platform-brand"><span className="platform-logo">+</span>dewa</Link>{verified ? <div className="register-success"><span className="success-mark">✓</span><span className="landing-kicker">ACCOUNT ACTIVATED</span><h2>Welcome to DEWA.</h2><p>Your account is now verified.</p><button className="platform-primary" onClick={() => router.push(destination())}>Open my workspace <Icon name="arrow" size={16} /></button></div> : <><span className="platform-kicker">OTP VERIFICATION</span><h1>Confirm your number</h1><p>Enter the six-digit code sent by SMS.</p><form onSubmit={submit}><label>Phone or email<input required value={target} onChange={(event) => setTarget(event.target.value)} placeholder="+213..." /></label><label>Verification code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} placeholder="123456" /></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="platform-primary full">Verify account <Icon name="arrow" size={16} /></button></form></>}</div></main>;
}
