"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PatientProfile } from "@/lib/api";
import { Icon, PlatformShell, StatusBadge } from "@/components/platform";

function initials(first?: string | null, last?: string | null) {
  const value = `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
  return value || "P";
}

function formatDate(value?: string | null) {
  if (!value) return "Not provided";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString("en", { dateStyle: "medium" });
}

export default function PatientProfile() {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.me().then((data) => {
      setProfile(data);
      setFirstName(data.first_name);
      setLastName(data.last_name);
      setEmail(data.email ?? "");
      setPhone(data.phone ?? "");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load your profile.")).finally(() => setLoading(false));
  }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    if (!email.trim() && !phone.trim()) {
      setError("Keep at least one contact method: an email address or a phone number.");
      setSaving(false);
      return;
    }
    try {
      const updated = await api.updatePatientProfile({
        first_name: firstName,
        last_name: lastName,
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      setProfile(updated);
      setEmail(updated.email ?? "");
      setPhone(updated.phone ?? "");
      setMessage("Your profile has been updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPassword.length < 10) {
      setError("Your new password must contain at least 10 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setChangingPassword(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password changed successfully. Other sessions were signed out.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to change your password.");
    } finally {
      setChangingPassword(false);
    }
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Your profile";
  const details = [
    { label: "Date of birth", value: formatDate(profile?.date_of_birth), icon: "chart" as const },
    { label: "Preferred language", value: (profile?.preferred_language ?? "fr").toUpperCase(), icon: "shield" as const },
    { label: "Gender", value: profile?.gender ?? "Not provided", icon: "users" as const },
    { label: "Last updated", value: formatDate(profile?.updated_at), icon: "file" as const },
  ];

  return (
    <PlatformShell role="patient" title="Profile">
      <div className="welcome-strip">
        <div>
          <span className="platform-kicker">PATIENT SPACE</span>
          <h2>Your profile</h2>
          <p>Your personal information, account details and security in one place.</p>
        </div>
        {profile && <StatusBadge tone="success">Account active</StatusBadge>}
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      {message && <div className="form-success" role="status">{message}</div>}

      {loading ? (
        <section className="platform-panel"><p className="panel-copy">Loading your profile...</p></section>
      ) : (
        <div className="profile-layout">
          <aside className="profile-identity platform-panel">
            <div className="profile-avatar-large">{initials(profile?.first_name, profile?.last_name)}</div>
            <h3>{fullName}</h3>
            <p className="profile-handle">{profile?.email ?? profile?.phone ?? "DEWA patient"}</p>
            <div className="profile-identity-badges">
              <StatusBadge tone="success">Verified patient</StatusBadge>
              <StatusBadge tone="neutral">{profile?.gender ?? "Account"}</StatusBadge>
            </div>
            <div className="profile-identity-list">
              <div><span>Patient ID</span><strong>{profile?.user_id ? `${profile.user_id.slice(0, 8)}…` : "—"}</strong></div>
              <div><span>Language</span><strong>{(profile?.preferred_language ?? "fr").toUpperCase()}</strong></div>
              <div><span>Last updated</span><strong>{formatDate(profile?.updated_at)}</strong></div>
            </div>
            <p className="profile-identity-note">
              Your DEWA account keeps prescriptions, pharmacy offers and delivery updates private to you.
            </p>
          </aside>

          <div className="profile-content">
            <section className="platform-panel">
              <div className="panel-title">
                <div><span className="platform-kicker">PERSONAL DETAILS</span><h3>About you</h3></div>
                <span className="profile-panel-icon"><Icon name="users" size={20} /></span>
              </div>
              <form className="preference-form" onSubmit={saveProfile}>
                <div className="form-grid">
                  <label>First name<input value={firstName} onChange={(event) => setFirstName(event.target.value)} required /></label>
                  <label>Last name<input value={lastName} onChange={(event) => setLastName(event.target.value)} required /></label>
                </div>
                <div className="form-grid">
                  <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.dz" /></label>
                  <label>Phone number<input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+213 6 12 34 56 78" /></label>
                </div>
                <p className="profile-field-note">Your email and phone are used for sign-in and important updates. Keep at least one up to date.</p>
                <div className="profile-detail-grid">
                  {details.map((detail) => (
                    <div className="profile-detail-tile" key={detail.label}>
                      <span className="profile-detail-icon"><Icon name={detail.icon} size={16} /></span>
                      <div><span>{detail.label}</span><strong>{detail.value}</strong></div>
                    </div>
                  ))}
                </div>
                <button className="platform-primary" disabled={saving}>
                  {saving ? "Saving..." : "Save changes"} <Icon name="arrow" size={16} />
                </button>
              </form>
            </section>

            <section className="platform-panel">
              <div className="panel-title">
                <div><span className="platform-kicker">SECURITY</span><h3>Change password</h3></div>
                <span className="profile-panel-icon is-purple"><Icon name="shield" size={20} /></span>
              </div>
              <p className="panel-copy">Use a unique password with at least 10 characters. Changing it signs out your other sessions.</p>
              <form className="preference-form" onSubmit={changePassword}>
                <label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoComplete="current-password" /></label>
                <div className="form-grid">
                  <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={10} autoComplete="new-password" /></label>
                  <label>Confirm new password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={10} autoComplete="new-password" /></label>
                </div>
                <button className="platform-primary" disabled={changingPassword}>
                  {changingPassword ? "Updating..." : "Update password"} <Icon name="arrow" size={16} />
                </button>
              </form>
            </section>
          </div>
        </div>
      )}
    </PlatformShell>
  );
}
