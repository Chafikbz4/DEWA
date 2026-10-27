"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { api, setSession } from "@/lib/api";
import { Icon } from "@/components/platform";

type RoleChoice = "patient" | "pharmacy" | "driver" | "company" | "admin";

const ROLE_OPTIONS: { id: RoleChoice; icon: "file" | "store" | "truck" | "users" | "shield"; title: string; detail: string; tone: string }[] = [
  { id: "patient", icon: "file", title: "Patient", detail: "Send prescriptions, compare offers, track orders.", tone: "teal" },
  { id: "pharmacy", icon: "store", title: "Pharmacy", detail: "Review requests, send offers, manage your stock.", tone: "purple" },
  { id: "driver", icon: "truck", title: "Driver", detail: "Pick up and deliver orders near you.", tone: "amber" },
  { id: "company", icon: "users", title: "Delivery company", detail: "Manage drivers and deliveries.", tone: "teal" },
  { id: "admin", icon: "shield", title: "Administrator", detail: "Platform back-office.", tone: "purple" },
];

const HOME_FOR: Record<string, string> = { admin: "/admin", pharmacy: "/pharmacy", driver: "/delivery", delivery: "/company" };

function homeForRole(role: string) {
  const value = role.toLowerCase();
  if (value.includes("admin")) return "/admin";
  if (value.includes("pharmacy")) return "/pharmacy";
  if (value.includes("driver")) return "/delivery";
  if (value.includes("delivery")) return "/company";
  return "/patient";
}

export default function LoginPage() {
  const [role, setRole] = useState<RoleChoice | "">("");
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
      router.push(homeForRole(session.user?.role ?? HOME_FOR[role] ?? ""));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to sign in."); } finally { setLoading(false); }
  }

  async function submitMfa(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const session = mfaSetupRequired ? await api.enableMfa(mfaToken, mfaCode) : await api.loginMfa(mfaToken, mfaCode);
      setSession(session);
      router.push(homeForRole(session.user?.role ?? ""));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to verify the authenticator code."); } finally { setLoading(false); }
  }

  const chosen = ROLE_OPTIONS.find((option) => option.id === role);

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="platform-brand"><span className="platform-logo">+</span>dewa</Link>

        {mfaToken ? (
          <>
            <span className="platform-kicker">AUTHENTICATOR VERIFICATION</span>
            <h1>{mfaSetupRequired ? "Set up secure access" : "Confirm your sign-in"}</h1>
            <p>{mfaSetupRequired ? "Add this account to your authenticator app, then enter the six-digit code." : "Enter the six-digit code from your authenticator app."}</p>
            {mfaSecret && <div className="panel-copy">{mfaSecret}</div>}
            <form onSubmit={submitMfa}>
              <label>Authenticator code<input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} placeholder="123456" /></label>
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="platform-primary full" disabled={loading}>{loading ? "Verifying..." : "Continue"} <span>→</span></button>
            </form>
          </>
        ) : !role ? (
          <>
            <span className="platform-kicker">SECURE ACCESS</span>
            <h1>How do you want to sign in?</h1>
            <p>Choose the account type you want to sign in to.</p>
            <div className="login-role-grid">
              {ROLE_OPTIONS.map((option) => (
                <button type="button" className={`login-role-option ${option.tone}`} key={option.id} onClick={() => { setRole(option.id); setError(""); }}>
                  <span className="login-role-icon"><Icon name={option.icon} size={20} /></span>
                  <span className="login-role-text"><strong>{option.title}</strong><small>{option.detail}</small></span>
                  <Icon name="arrow" size={16} />
                </button>
              ))}
            </div>
            <p className="auth-foot">New to DEWA? <Link href="/register/patient">Create a patient account</Link></p>
          </>
        ) : (
          <>
            <button type="button" className="auth-back" onClick={() => { setRole(""); setError(""); }}><Icon name="arrow" size={14} /> Choose a different account type</button>
            <span className="platform-kicker">{(chosen?.title ?? "SECURE ACCESS").toUpperCase()} SIGN IN</span>
            <h1>Welcome back</h1>
            <p>Sign in to your DEWA {chosen?.title.toLowerCase()} space.</p>
            <form onSubmit={submit}>
              <label>Email or phone<input required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="you@example.com" /></label>
              <label>Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></label>
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="platform-primary full" disabled={loading}>{loading ? "Signing in..." : "Sign in"} <span>→</span></button>
            </form>
            <p className="auth-foot">New to DEWA? <Link href={role === "pharmacy" ? "/register/pharmacist" : role === "driver" ? "/register/driver" : role === "company" ? "/register/company" : "/register/patient"}>Create an account</Link></p>
          </>
        )}
      </div>
    </main>
  );
}
