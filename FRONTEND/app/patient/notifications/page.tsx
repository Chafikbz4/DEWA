"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, Notification, NotificationPreferences } from "@/lib/api";
import { Icon, PlatformShell, Role, StatusBadge } from "@/components/platform";

const defaultPreferences: NotificationPreferences = {
  push_enabled: true,
  sms_enabled: true,
  email_enabled: true,
  muted_types: [],
  available_types: [],
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function PatientNotifications({ role = "patient" }: { role?: Role }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      api.notifications() as Promise<Notification[]>,
      api.notificationPreferences(),
    ]).then(([items, settings]) => {
      setNotifications(items);
      setPreferences(settings);
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load notifications.");
    }).finally(() => setLoading(false));
  }, []);

  async function markAllRead() {
    setError("");
    try {
      await api.markAllNotificationsRead();
      setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update notifications.");
    }
  }

  async function markRead(id: string) {
    try {
      await api.markNotificationRead(id);
      setNotifications((items) => items.map((item) => item.id === id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update notification.");
    }
  }

  async function savePreferences(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      setPreferences(await api.updateNotificationPreferences(preferences));
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save notification preferences.");
    } finally {
      setSaving(false);
    }
  }

  return <PlatformShell role={role} title="Notifications"><div className="welcome-strip"><div><span className="platform-kicker">{role === "admin" ? "BACK-OFFICE" : role === "patient" ? "PATIENT SPACE" : `${role.toUpperCase()} SPACE`}</span><h2>Stay up to date.</h2><p>Review status changes, delivery updates and account alerts.</p></div><StatusBadge tone="success">{notifications.filter((item) => !item.read_at).length} unread</StatusBadge></div>
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="platform-grid two">
      <section className="platform-panel"><div className="panel-title"><div><span className="platform-kicker">INBOX</span><h3>Your notifications</h3></div><button className="platform-secondary" onClick={markAllRead} disabled={!notifications.some((item) => !item.read_at)}>Mark all as read</button></div>{loading ? <p className="panel-copy">Loading notifications...</p> : notifications.length === 0 ? <p className="panel-copy">You are all caught up. New updates will appear here.</p> : <div className="notification-list">{notifications.map((item) => <article className={item.read_at ? "notification-item" : "notification-item unread"} key={item.id}><span className="notification-icon"><Icon name="bell" size={16} /></span><div><div className="notification-heading"><strong>{item.title}</strong>{!item.read_at && <StatusBadge tone="success">New</StatusBadge>}</div><p>{item.body}</p><small>{formatDate(item.created_at)}</small>{!item.read_at && <button className="text-button" onClick={() => markRead(item.id)}>Mark as read</button>}</div></article>)}</div>}</section>
      <section className="platform-panel"><div className="panel-title"><div><span className="platform-kicker">PREFERENCES</span><h3>Notification delivery</h3></div></div><form className="preference-form" onSubmit={savePreferences}>{(["push_enabled", "sms_enabled", "email_enabled"] as const).map((key) => <label className="check-row" key={key}><input type="checkbox" checked={preferences[key]} onChange={(event) => setPreferences({ ...preferences, [key]: event.target.checked })} /> {key === "push_enabled" ? "Push notifications" : key === "sms_enabled" ? "Text messages" : "Email updates"}</label>)}<button className="platform-primary" disabled={saving}>{saving ? "Saving..." : "Save preferences"}</button>{saved && <span className="form-success" role="status">Preferences saved.</span>}</form></section>
    </div>
  </PlatformShell>;
}
