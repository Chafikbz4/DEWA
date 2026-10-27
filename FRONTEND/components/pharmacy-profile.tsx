"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Icon, PlatformShell, StatusBadge } from "@/components/platform";

type RecordValue = Record<string, unknown>;

function text(value: unknown, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function date(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf())
    ? text(value)
    : parsed.toLocaleDateString("en", { dateStyle: "medium" });
}

function statusTone(status: unknown) {
  const value = String(status ?? "").toUpperCase();
  return value === "VERIFIED" ? "success" : value === "REJECTED" ? "warning" : "neutral";
}

export function PharmacyProfilePage() {
  const [profile, setProfile] = useState<RecordValue | null>(null);
  const [form, setForm] = useState({
    name_fr: "",
    name_ar: "",
    legal_name: "",
    authorization_number: "",
    tax_id_nif: "",
    commercial_register_rc: "",
    address_line: "",
    phone: "",
    email: "",
    delivery_available: false,
    accepts_requests: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.pharmacyMe()
      .then((value) => {
        const data = value && typeof value === "object" ? (value as RecordValue) : {};
        setProfile(data);
        setForm({
          name_fr: text(data.name_fr, ""),
          name_ar: text(data.name_ar, ""),
          legal_name: text(data.legal_name, ""),
          authorization_number: text(data.authorization_number, ""),
          tax_id_nif: text(data.tax_id_nif, ""),
          commercial_register_rc: text(data.commercial_register_rc, ""),
          address_line: text(data.address_line, ""),
          phone: text(data.phone, ""),
          email: text(data.email, ""),
          delivery_available: data.delivery_available === true,
          accepts_requests: data.accepts_requests !== false,
        });
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load your pharmacy profile."))
      .finally(() => setLoading(false));
  }, []);

  const isOwner = String(profile?.my_staff_role ?? "").toUpperCase() === "OWNER";
  const isVerified = String(profile?.status ?? "").toUpperCase() === "VERIFIED";
  const canEditLegal = isOwner && !isVerified;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!isOwner) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.updatePharmacyProfile({
        name_fr: form.name_fr,
        name_ar: form.name_ar || null,
        ...(canEditLegal
          ? {
              legal_name: form.legal_name || null,
              authorization_number: form.authorization_number || null,
              tax_id_nif: form.tax_id_nif || null,
              commercial_register_rc: form.commercial_register_rc || null,
            }
          : {}),
        address_line: form.address_line,
        phone: form.phone || null,
        email: form.email || null,
        delivery_available: form.delivery_available,
        accepts_requests: form.accepts_requests,
      });
      const data = updated && typeof updated === "object" ? (updated as RecordValue) : profile ?? {};
      setProfile(data);
      setMessage("Your pharmacy profile has been updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update your pharmacy profile.");
    } finally {
      setSaving(false);
    }
  }

  const name = form.name_fr || "Your pharmacy";
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "PH";
  const completeness = [form.name_fr, form.address_line, form.phone, form.email, form.authorization_number].filter(Boolean).length;
  const completion = Math.round((completeness / 5) * 100);

  return (
    <PlatformShell role="pharmacy" title="Pharmacy profile">
      <div className="welcome-strip">
        <div>
          <span className="platform-kicker">PHARMACY SPACE</span>
          <h2>Your pharmacy</h2>
          <p>The public identity, contact details and capabilities patients see.</p>
        </div>
        <StatusBadge tone={statusTone(profile?.status)}>{text(profile?.status, "Loading")}</StatusBadge>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      {message && <div className="form-success" role="status">{message}</div>}

      {loading ? (
        <section className="platform-panel"><p className="panel-copy">Loading your pharmacy profile...</p></section>
      ) : (
        <>
        <section className="pharmacy-hero">
          <div className="pharmacy-hero-cover" />
          <div className="pharmacy-hero-body">
            <div className="pharmacy-hero-avatar">{initials}</div>
            <div className="pharmacy-hero-info">
              <div className="pharmacy-hero-title">
                <h3>{name}</h3>
                <StatusBadge tone={statusTone(profile?.status)}>{text(profile?.status, "Draft")}</StatusBadge>
              </div>
              {form.name_ar ? <p dir="rtl">{form.name_ar}</p> : null}
              <div className="pharmacy-hero-meta">
                <span><Icon name="store" size={14} /> {form.address_line || "Address not set"}</span>
                <span><Icon name="users" size={14} /> {form.phone || "Phone not set"}</span>
                <span><Icon name="file" size={14} /> {form.email || "Email not set"}</span>
              </div>
            </div>
            <div className="pharmacy-hero-stats">
              <div><strong>{form.delivery_available ? "Delivery" : "Pickup"}</strong><span>Fulfillment</span></div>
              <div><strong>{completion}%</strong><span>Complete</span></div>
              <div><strong>{form.accepts_requests ? "Open" : "Paused"}</strong><span>Requests</span></div>
            </div>
          </div>
        </section>
        <div className="profile-layout pharmacy-profile-layout">
          <aside className="profile-identity platform-panel pharmacy-identity">
            <div className="profile-avatar-large pharmacy-avatar">{initials}</div>
            <h3>{name}</h3>
            {form.name_ar ? <p className="profile-handle" dir="rtl">{form.name_ar}</p> : null}
            <div className="profile-identity-badges">
              <StatusBadge tone={statusTone(profile?.status)}>{text(profile?.status, "Draft")}</StatusBadge>
              <StatusBadge tone={form.delivery_available ? "success" : "neutral"}>{form.delivery_available ? "Delivery on" : "Pickup only"}</StatusBadge>
            </div>
            <div className="profile-identity-list">
              <div><span>Staff role</span><strong>{text(profile?.my_staff_role, "Member")}</strong></div>
              <div><span>Verified</span><strong>{date(profile?.verified_at)}</strong></div>
              <div><span>Avg. response</span><strong>{profile?.avg_response_minutes ? `${text(profile.avg_response_minutes)} min` : "—"}</strong></div>
              <div><span>Updated</span><strong>{date(profile?.updated_at)}</strong></div>
            </div>
            <div className="pharmacy-completion">
              <div><span>Profile completeness</span><strong>{completion}%</strong></div>
              <div className="pharmacy-completion-bar"><i style={{ width: `${completion}%` }} /></div>
            </div>
            <p className="profile-identity-note">Patients only see your pharmacy name, area and contact details after you accept their request.</p>
          </aside>

          <div className="profile-content">
            <section className="platform-panel">
              <div className="panel-title">
                <div><span className="platform-kicker">PUBLIC IDENTITY</span><h3>Pharmacy details</h3></div>
                <span className="profile-panel-icon"><Icon name="store" size={20} /></span>
              </div>
              {!isOwner && <p className="panel-copy pharmacy-readonly-note">Only the pharmacy owner can edit these details. You can still review them here.</p>}
              <form className="preference-form" onSubmit={save}>
                <div className="form-grid">
                  <label>Pharmacy name (FR)<input value={form.name_fr} onChange={(event) => setForm({ ...form, name_fr: event.target.value })} required disabled={!isOwner} /></label>
                  <label>Pharmacy name (AR)<input value={form.name_ar} onChange={(event) => setForm({ ...form, name_ar: event.target.value })} dir="rtl" disabled={!isOwner} /></label>
                </div>
                <label>Address<input value={form.address_line} onChange={(event) => setForm({ ...form, address_line: event.target.value })} disabled={!isOwner} /></label>
                <div className="form-grid">
                  <label>Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} inputMode="tel" disabled={!isOwner} /></label>
                  <label>Email<input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" disabled={!isOwner} /></label>
                </div>
                <div className="pharmacy-toggle-grid">
                  <label className="check-row"><input type="checkbox" checked={form.accepts_requests} onChange={(event) => setForm({ ...form, accepts_requests: event.target.checked })} disabled={!isOwner} /> Accept new patient requests</label>
                  <label className="check-row"><input type="checkbox" checked={form.delivery_available} onChange={(event) => setForm({ ...form, delivery_available: event.target.checked })} disabled={!isOwner} /> Offer home delivery</label>
                </div>

                <div className="pharmacy-legal-block">
                  <div className="pharmacy-legal-head">
                    <span className="platform-kicker">LEGAL INFORMATION</span>
                    {isVerified ? <StatusBadge tone="neutral">Locked after verification</StatusBadge> : null}
                  </div>
                  <div className="form-grid">
                    <label>Legal name<input value={form.legal_name} onChange={(event) => setForm({ ...form, legal_name: event.target.value })} disabled={!canEditLegal} /></label>
                    <label>Authorization number<input value={form.authorization_number} onChange={(event) => setForm({ ...form, authorization_number: event.target.value })} disabled={!canEditLegal} /></label>
                    <label>Tax ID (NIF)<input value={form.tax_id_nif} onChange={(event) => setForm({ ...form, tax_id_nif: event.target.value })} disabled={!canEditLegal} /></label>
                    <label>Commercial register (RC)<input value={form.commercial_register_rc} onChange={(event) => setForm({ ...form, commercial_register_rc: event.target.value })} disabled={!canEditLegal} /></label>
                  </div>
                </div>

                {isOwner ? <button className="platform-primary" disabled={saving}>{saving ? "Saving..." : "Save pharmacy profile"} <Icon name="arrow" size={16} /></button> : null}
              </form>
            </section>

            <section className="platform-panel pharmacy-status-panel">
              <div className="panel-title">
                <div><span className="platform-kicker">TRUST</span><h3>Verification and visibility</h3></div>
                <span className="profile-panel-icon is-purple"><Icon name="shield" size={20} /></span>
              </div>
              <div className="pharmacy-status-grid">
                <div><span>Verification</span><strong>{text(profile?.status, "Draft")}</strong><small>Required before receiving live requests.</small></div>
                <div><span>Submitted</span><strong>{date(profile?.submitted_for_review_at)}</strong><small>Last verification submission.</small></div>
                <div><span>Requests</span><strong>{form.accepts_requests ? "Open" : "Paused"}</strong><small>Patients can {form.accepts_requests ? "send" : "not send"} requests.</small></div>
                <div><span>Delivery</span><strong>{form.delivery_available ? "Available" : "Not offered"}</strong><small>Handled through DEWA delivery partners.</small></div>
              </div>
              {profile?.rejection_reason ? <div className="form-error" role="alert">Verification note: {text(profile.rejection_reason)}</div> : null}
            </section>
          </div>
        </div>
        </>
      )}
    </PlatformShell>
  );
}
