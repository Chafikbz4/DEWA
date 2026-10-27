"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, Notification, NotificationPreferences } from "@/lib/api";
import { Icon, PlatformShell, Role, StatusBadge } from "@/components/platform";

const defaultPreferences: NotificationPreferences = {
  push_enabled: true,
  sms_enabled: true,
  email_enabled: true,
  muted_types: [],
  available_types: [],
};

type FeedFilter = "all" | "unread";

const STATUS_ACTIONS: Record<string, string> = {
  AWAITING_PAYMENT: "Payment requested",
  PAYMENT_PENDING: "Payment is being confirmed",
  PAYMENT_CONFIRMED: "Payment confirmed",
  PHARMACIST_VALIDATION_PENDING: "Pharmacist is validating your order",
  PREPARING: "Your order is being prepared",
  READY_FOR_PICKUP: "Your order is ready",
  DELIVERY_ASSIGNED: "A delivery company was assigned",
  PICKED_UP: "Your order is on the way",
  OUT_FOR_DELIVERY: "Your order is on the way",
  DELIVERED: "Your order was delivered",
  COMPLETED: "Your order was collected",
  CANCELLED: "Your order was cancelled",
  REFUND_PENDING: "A refund is being processed",
  REFUNDED: "Your refund was completed",
  FAILED: "Payment did not go through",
};

/** One consistent activity line for every notification type. */
function notificationAction(item: Notification) {
  const type = item.type.toUpperCase();
  const status = String(item.params?.status ?? "").toUpperCase();
  switch (type) {
    case "REQUEST_RECEIVED":
      return "New prescription request received";
    case "OFFER_RECEIVED":
      return "New offer received from a pharmacy";
    case "OFFER_ACCEPTED":
      return "Request accepted by a pharmacy";
    case "REQUEST_CANCELLED":
      return "Request cancelled";
    case "REQUEST_EXPIRED":
      return "Request expired";
    case "CLARIFICATION_REQUESTED":
      return "A pharmacy asked for more information";
    case "CLARIFICATION_ANSWERED":
      return "Clarification was answered";
    case "NEW_MESSAGE":
      return "New message received";
    case "ORDER_STATUS_CHANGED":
      return STATUS_ACTIONS[status] ?? "Order status updated";
    case "PHARMACY_ORDER_UPDATE":
      return STATUS_ACTIONS[status] ?? "Order updated";
    case "PAYMENT_CONFIRMED":
      return "Payment confirmed";
    case "PAYMENT_FAILED":
      return "Payment did not go through";
    case "REFUND_COMPLETED":
      return "Refund completed";
    case "DELIVERY_CODE":
    case "COLLECTION_CODE":
    case "PICKUP_CODE":
      return "Collection code available";
    case "DELIVERY_JOB_AVAILABLE":
      return "New delivery job available";
    case "ACCOUNT_STATUS_CHANGED":
      return "Account status changed";
    case "VERIFICATION_DECIDED":
      return "Verification decision received";
    case "ADMIN_ALERT":
      return "Action needed";
    case "COMPLAINT_OUTCOME":
      return "Complaint update received";
    default:
      return item.title || "New update";
  }
}

function notificationTone(item: Notification) {
  const status = String(item.params?.status ?? "").toUpperCase();
  const text = `${item.type} ${status}`.toUpperCase();
  if (
    text.includes("DELIVER") ||
    text.includes("COMPLETE") ||
    text.includes("CONFIRMED") ||
    text.includes("READY") ||
    text.includes("ACCEPTED") ||
    text.includes("VERIF")
  )
    return "success";
  if (
    text.includes("FAILED") ||
    text.includes("CANCEL") ||
    text.includes("EXPIRED") ||
    text.includes("REQUESTED")
  )
    return "warning";
  return "neutral";
}

function notificationIcon(item: Notification) {
  const type = item.type.toUpperCase();
  if (type.includes("DELIVERY") || type.includes("COLLECTION") || type.includes("PICKUP"))
    return "truck" as const;
  if (type.includes("OFFER") || type.includes("ORDER") || type.includes("PAYMENT"))
    return "cart" as const;
  if (type.includes("REQUEST")) return "file" as const;
  if (type.includes("ACCOUNT") || type.includes("VERIFICATION")) return "shield" as const;
  if (type.includes("MESSAGE")) return "users" as const;
  return "bell" as const;
}

function notificationItems(value: unknown): Notification[] {
  if (Array.isArray(value)) return value as Notification[];
  if (value && typeof value === "object") {
    const object = value as { items?: Notification[]; data?: Notification[] };
    return object.items ?? object.data ?? [];
  }
  return [];
}

function dayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Earlier";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Earlier";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).valueOf();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).valueOf();
  const diff = Math.round((today - day) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString("en", { dateStyle: "medium" });
}

function feedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  return date.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
}

export function NotificationsPage({ role = "patient" }: { role?: Role }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);

  function load() {
    setLoading(true);
    setError("");
    api.notifications({ limit: 80 })
      .then((value) => setNotifications(notificationItems(value)))
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Unable to load notifications."),
      )
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    api.notifications({ limit: 80 })
      .then((value) => { if (active) setNotifications(notificationItems(value)); })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load notifications.");
      })
      .finally(() => { if (active) setLoading(false); });
    api.notificationPreferences()
      .then((value) => { if (active) setPreferences(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function markAllRead() {
    setError("");
    try {
      await api.markAllNotificationsRead();
      setNotifications((items) =>
        items.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update notifications.");
    }
  }

  async function markRead(id: string) {
    setNotifications((items) =>
      items.map((item) =>
        item.id === id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item,
      ),
    );
    try {
      await api.markNotificationRead(id);
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

  const unread = notifications.filter((item) => !item.read_at).length;
  const visible = filter === "unread" ? notifications.filter((item) => !item.read_at) : notifications;
  const groups = useMemo(() => {
    const map = new Map<string, Notification[]>();
    visible.forEach((item) => {
      const key = dayKey(item.created_at);
      const group = map.get(key) ?? [];
      group.push(item);
      map.set(key, group);
    });
    return [...map.entries()];
  }, [visible]);

  const roleLabel =
    role === "admin" ? "BACK-OFFICE" : role === "patient" ? "PATIENT SPACE" : `${role.toUpperCase()} SPACE`;
  const activeDays = new Set(notifications.map((item) => dayKey(item.created_at))).size;

  return (
    <PlatformShell role={role} title="Notifications">
      <div className="welcome-strip">
        <div>
          <span className="platform-kicker">{roleLabel}</span>
          <h2>Activity</h2>
          <p>Every update appears as one clear line, newest first.</p>
        </div>
        <StatusBadge tone={unread ? "warning" : "success"}>
          {unread ? `${unread} unread` : "All caught up"}
        </StatusBadge>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="notification-summary">
        <div className={`notification-summary-card${unread ? " is-warning" : ""}`}>
          <span className="notification-summary-icon"><Icon name="bell" size={18} /></span>
          <div><strong>{unread}</strong><span>Unread updates</span></div>
        </div>
        <div className="notification-summary-card">
          <span className="notification-summary-icon"><Icon name="file" size={18} /></span>
          <div><strong>{notifications.length}</strong><span>Total activity</span></div>
        </div>
        <div className="notification-summary-card is-purple">
          <span className="notification-summary-icon"><Icon name="chart" size={18} /></span>
          <div><strong>{activeDays || "—"}</strong><span>Active days</span></div>
        </div>
      </div>

      <section className="platform-panel notification-feed-panel">
        <div className="panel-title notification-feed-title">
          <div>
            <span className="platform-kicker">LIVE FEED</span>
            <h3>What happened</h3>
          </div>
          <div className="notification-feed-actions">
            <div className="delivery-filters notification-filters">
              <button
                className={`delivery-filter${filter === "all" ? " is-active" : ""}`}
                type="button"
                onClick={() => setFilter("all")}
              >
                All <b>{notifications.length}</b>
              </button>
              <button
                className={`delivery-filter${filter === "unread" ? " is-active" : ""}`}
                type="button"
                onClick={() => setFilter("unread")}
              >
                Unread <b>{unread}</b>
              </button>
            </div>
            <button className="platform-secondary" type="button" onClick={load} disabled={loading}>
              Refresh
            </button>
            <button
              className="platform-secondary"
              type="button"
              onClick={() => setShowPreferences((value) => !value)}
            >
              {showPreferences ? "Hide alerts" : "Delivery settings"}
            </button>
            <button
              className="platform-secondary"
              type="button"
              onClick={markAllRead}
              disabled={!unread}
            >
              Mark all read
            </button>
          </div>
        </div>

        {loading ? (
          <p className="panel-copy">Loading your activity...</p>
        ) : visible.length === 0 ? (
          <div className="delivery-empty notification-empty">
            <Icon name="bell" size={22} />
            <h4>{filter === "unread" ? "Nothing unread" : "No activity yet"}</h4>
            <p className="panel-copy">
              {filter === "unread"
                ? "You have read every update. Switch to All to see the full history."
                : "New requests, offers, delivery updates and payments will appear here."}
            </p>
          </div>
        ) : (
          <div className="notification-feed">
            {groups.map(([key, items]) => (
              <div className="notification-day" key={key}>
                <span className="notification-day-label">{dayLabel(items[0].created_at)}</span>
                <div className="notification-lines">
                  {items.map((item) => (
                    <article
                      className={`notification-line${item.read_at ? "" : " is-unread"}`}
                      key={item.id}
                      onClick={() => { if (!item.read_at) void markRead(item.id); }}
                    >
                      <span className={`notification-line-icon ${notificationTone(item)}`}>
                        <Icon name={notificationIcon(item)} size={15} />
                      </span>
                      <div className="notification-line-body">
                        <p>
                          <strong>{notificationAction(item)}</strong>
                          <span className="notification-line-time"> at {feedTime(item.created_at)}</span>
                        </p>
                        <span className="notification-line-meta">
                          {item.params?.reference ? `${String(item.params.reference)} · ` : ""}
                          {item.type.replaceAll("_", " ").toLowerCase()}
                        </span>
                      </div>
                      {!item.read_at ? <i className="notification-unread-dot" aria-label="Unread" /> : null}
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showPreferences && (
        <section className="platform-panel notification-preferences-panel">
          <div className="panel-title">
            <div>
              <span className="platform-kicker">ALERTS</span>
              <h3>How we reach you</h3>
            </div>
          </div>
          <form className="preference-form notification-preferences" onSubmit={savePreferences}>
            <div className="notification-channel-grid">
              {(["push_enabled", "sms_enabled", "email_enabled"] as const).map((key) => (
                <label className="check-row" key={key}>
                  <input
                    type="checkbox"
                    checked={preferences[key]}
                    onChange={(event) =>
                      setPreferences({ ...preferences, [key]: event.target.checked })
                    }
                  />{" "}
                  {key === "push_enabled"
                    ? "Push notifications"
                    : key === "sms_enabled"
                      ? "Text messages"
                      : "Email updates"}
                </label>
              ))}
            </div>
            <button className="platform-primary" disabled={saving}>
              {saving ? "Saving..." : "Save preferences"}
            </button>
            {saved && <span className="form-success" role="status">Preferences saved.</span>}
          </form>
        </section>
      )}
    </PlatformShell>
  );
}
