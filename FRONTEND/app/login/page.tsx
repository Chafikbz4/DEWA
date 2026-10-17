"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api, setSession } from "@/lib/api";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false);
  const [mfaSecret, setMfaSecret] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const session = await api.login(identifier, password);
      if ("mfa_required" in session && session.mfa_required) {
        setMfaToken(session.mfa_token);
        setMfaSetupRequired(Boolean(session.mfa_setup_required));
        if (session.mfa_setup_required) {
          const setup = await api.setupMfa(session.mfa_token);
          setMfaSecret(`${setup.secret} (${setup.otpauth_url})`);
        }
        return;
      }
      setSession(session);
      const role = session.user?.role.toLowerCase() ?? "";
      router.push(role.includes("admin") ? "/admin" : role.includes("pharmacy") ? "/pharmacy" : role.includes("driver") ? "/delivery" : role.includes("delivery") ? "/company" : "/patient");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to sign in."); } finally { setLoading(false); }
  }
  async function submitMfa(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const session = mfaSetupRequired ? await api.enableMfa(mfaToken, mfaCode) : await api.loginMfa(mfaToken, mfaCode);
      setSession(session);
      const role = session.user?.role.toLowerCase() ?? "";
      router.push(role.includes("admin") ? "/admin" : role.includes("pharmacy") ? "/pharmacy" : "/patient");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to verify the authenticator code."); } finally { setLoading(false); }
  }
  return <main className="auth-page"><div className="auth-card"><Link href="/" className="platform-brand"><span className="platform-logo">+</span>dewa</Link>{mfaToken ? <><span className="platform-kicker">AUTHENTICATOR VERIFICATION</span><h1>{mfaSetupRequired ? "Set up secure access" : "Confirm your sign-in"}</h1><p>{mfaSetupRequired ? "Add this account to your authenticator app, then enter the six-digit code." : "Enter the six-digit code from your authenticator app."}</p>{mfaSecret && <div className="panel-copy">{mfaSecret}</div>}<form onSubmit={submitMfa}><label>Authenticator code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} placeholder="123456" /></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="platform-primary full" disabled={loading}>{loading ? "Verifying..." : "Continue"} <span>→</span></button></form></> : <><span className="platform-kicker">SECURE ACCESS</span><h1>Welcome back</h1><p>Sign in to continue to your DEWA space.</p><form onSubmit={submit}><label>Email or phone<input required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="you@example.com" /></label><label>Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></label>{error && <div className="form-error" role="alert">{error}</div>}<button className="platform-primary full" disabled={loading}>{loading ? "Signing in..." : "Sign in"} <span>→</span></button></form><p className="auth-foot">New to DEWA? <Link href="/register/patient">Create a patient account</Link></p></>}</div></main>;
}
