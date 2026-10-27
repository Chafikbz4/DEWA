"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Icon, PlatformShell, StatusBadge } from "@/components/platform";

type RecordValue = Record<string, unknown>;
type PaymentFilter = "all" | "online" | "pickup" | "delivery";

function records(value: unknown): RecordValue[] {
  if (Array.isArray(value)) return value.filter((item): item is RecordValue => Boolean(item && typeof item === "object"));
  if (value && typeof value === "object") {
    const object = value as RecordValue;
    for (const key of ["items", "data", "results"]) if (Array.isArray(object[key])) return records(object[key]);
  }
  return [];
}

function text(value: unknown, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function money(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? `${(parsed / 100).toLocaleString("en-DZ")} DZD` : "—";
}

function date(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf()) ? text(value) : parsed.toLocaleDateString("en", { dateStyle: "medium" });
}

function dateTime(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf()) ? text(value) : parsed.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

function methodLabel(method: unknown, fallback = "Card online") {
  const value = String(method ?? "").toUpperCase();
  if (value === "CCP") return "CCP online payment";
  if (value === "BARIDIMOB") return "BaridiMob online payment";
  if (value === "ON_DELIVERY") return "Cash on delivery / pickup";
  return fallback;
}

function methodIcon(method: string) {
  if (method === "pickup") return "store" as const;
  if (method === "delivery") return "truck" as const;
  return "cart" as const;
}

function paymentItems(order: RecordValue | null) {
  const items = order?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is RecordValue => Boolean(item && typeof item === "object"))
    .map((item) => ({ name: text(item.name, "Item"), quantity: Number(item.quantity ?? 1) }));
}

const PAID_ORDER_STATUSES = ["PAYMENT_CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "DELIVERY_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED"];

export function PatientPaymentHistory() {
  const [requests, setRequests] = useState<RecordValue[]>([]);
  const [orders, setOrders] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<PaymentFilter>("all");

  useEffect(() => {
    let active = true;
    Promise.all([api.requests({ limit: 100 }), api.orders({ limit: 100 })])
      .then(([requestValue, orderValue]) => {
        if (!active) return;
        setRequests(records(requestValue));
        setOrders(records(orderValue));
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load your payments.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const entries = useMemo(() => {
    const requestById = new Map(requests.map((request) => [String(request.id ?? ""), request]));
    const seenRequests = new Set<string>();
    const rows: {
      key: string;
      reference: string;
      requestReference: string;
      pharmacy: string;
      area: string;
      amount: number | null;
      method: string;
      methodText: string;
      paid: boolean;
      online: boolean;
      fulfillment: string;
      statusLabel: string;
      paidAt: unknown;
      selectedAt: unknown;
      items: { name: string; quantity: number }[];
      orderReference: string;
    }[] = [];

    orders.forEach((order) => {
      const requestId = String(order.request_id ?? "");
      const request = requestById.get(requestId) ?? {};
      if (requestId) seenRequests.add(requestId);
      const orderStatus = String(order.status ?? "").toUpperCase();
      const method = String(request.payment_method ?? "").toUpperCase();
      const paymentStatus = String(request.payment_status ?? "").toUpperCase();
      const online = ["CCP", "BARIDIMOB"].includes(method);
      const settled = ["PICKED_UP", "DELIVERED", "COMPLETED"].includes(String(request.fulfillment_status ?? "").toUpperCase());
      // Online methods are not charged yet: they stay "not charged" until the
      // backend records an actual PAID status. Cash/on-delivery settles when the
      // pharmacy marks the order collected or delivered.
      const paid =
        paymentStatus === "PAID" ||
        (!online && (PAID_ORDER_STATUSES.includes(orderStatus) || settled));
      if (!paid && !online) return;
      const fulfillment = String(request.fulfillment_type ?? order.fulfillment_type ?? "").toUpperCase();
      const pharmacy = order.pharmacy && typeof order.pharmacy === "object" ? order.pharmacy as RecordValue : {};
      rows.push({
        key: `order-${String(order.id ?? order.reference ?? requestId)}`,
        reference: text(order.reference ?? request.reference ?? order.id),
        requestReference: text(request.reference ?? requestId, ""),
        pharmacy: text(request.accepted_pharmacy_name_fr ?? pharmacy.name_fr ?? pharmacy.name, "Pharmacy"),
        area: text(pharmacy.address_line ?? [request.commune_name_fr, request.wilaya_name_fr].filter(Boolean).join(", "), ""),
        amount: typeof order.total_centimes === "number" ? order.total_centimes : Number(request.accepted_amount_centimes ?? NaN) || null,
        method: fulfillment === "PICKUP" ? "pickup" : fulfillment === "DELIVERY" ? "delivery" : "online",
        methodText: method ? methodLabel(method) : methodLabel(null, "Payment recorded"),
        paid,
        online: online && !paid,
        fulfillment,
        statusLabel: paid ? "Paid" : online ? "Not charged yet" : "Awaiting payment",
        paidAt: request.paid_at ?? (paid ? order.updated_at : null),
        selectedAt: request.checkout_completed_at ?? order.created_at,
        items: paymentItems(order),
        orderReference: text(order.reference, ""),
      });
    });

    requests.forEach((request) => {
      const requestId = String(request.id ?? "");
      if (!requestId || seenRequests.has(requestId)) return;
      const method = String(request.payment_method ?? "").toUpperCase();
      if (!method) return;
      const online = ["CCP", "BARIDIMOB"].includes(method);
      const fulfillment = String(request.fulfillment_type ?? "").toUpperCase();
      const fulfillmentStatus = String(request.fulfillment_status ?? "").toUpperCase();
      const paymentStatus = String(request.payment_status ?? "").toUpperCase();
      const pickedUp = fulfillment === "PICKUP" && fulfillmentStatus === "PICKED_UP";
      const delivered = fulfillment === "DELIVERY" && fulfillmentStatus === "DELIVERED";
      const paid = paymentStatus === "PAID" || (!online && (pickedUp || delivered));
      if (!paid && !online) return;
      rows.push({
        key: `request-${requestId}`,
        reference: text(request.reference ?? requestId),
        requestReference: text(request.reference, ""),
        pharmacy: text(request.accepted_pharmacy_name_fr, "Pharmacy"),
        area: [request.commune_name_fr, request.wilaya_name_fr].filter(Boolean).join(", "),
        amount: typeof request.accepted_amount_centimes === "number" ? request.accepted_amount_centimes : null,
        method: fulfillment === "PICKUP" ? "pickup" : fulfillment === "DELIVERY" ? "delivery" : "online",
        methodText: methodLabel(method),
        paid,
        online: online && !paid,
        fulfillment,
        statusLabel: paid ? "Paid" : "Not charged yet",
        paidAt: request.paid_at ?? (paid ? request.fulfillment_updated_at ?? request.checkout_completed_at : null),
        selectedAt: request.checkout_completed_at,
        items: [],
        orderReference: "",
      });
    });

    return rows.sort((a, b) => {
      const at = new Date(String(a.paidAt ?? a.selectedAt ?? "")).valueOf();
      const bt = new Date(String(b.paidAt ?? b.selectedAt ?? "")).valueOf();
      return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
    });
  }, [requests, orders]);

  const paidEntries = entries.filter((entry) => entry.paid);
  const onlineEntries = entries.filter((entry) => entry.online);
  const totalPaid = paidEntries.reduce((total, entry) => total + (entry.amount ?? 0), 0);
  const totalSelected = onlineEntries.reduce((total, entry) => total + (entry.amount ?? 0), 0);
  const lastPaid = paidEntries.find((entry) => entry.paidAt)?.paidAt;
  const visible = entries.filter((entry) => {
    if (filter === "all") return true;
    if (filter === "online") return entry.online;
    return entry.method === filter;
  });
  const filters: { id: PaymentFilter; label: string; count: number }[] = [
    { id: "all", label: "All payments", count: entries.length },
    { id: "online", label: "Online, not charged", count: onlineEntries.length },
    { id: "pickup", label: "Pickup", count: entries.filter((entry) => entry.method === "pickup").length },
    { id: "delivery", label: "Delivery", count: entries.filter((entry) => entry.method === "delivery").length },
  ];

  return (
    <PlatformShell role="patient" title="Payment history">
      <div className="welcome-strip">
        <div>
          <span className="platform-kicker">PATIENT SPACE</span>
          <h2>Payments</h2>
          <p>Orders you paid online or collected from the pharmacy, with the amount and payment date.</p>
        </div>
        <StatusBadge tone={totalPaid ? "success" : "neutral"}>{money(totalPaid)} paid</StatusBadge>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}

      <section className="platform-panel payment-history-panel">
        <div className="panel-title">
          <div>
            <span className="platform-kicker">PAYMENT SUMMARY</span>
            <h3>Your spending</h3>
          </div>
          <Link href="/patient/orders" className="platform-secondary">Order board <Icon name="arrow" size={15} /></Link>
        </div>

        <div className="payment-summary-grid">
          <div className="payment-summary-card is-primary">
            <span>Total paid</span>
            <strong>{money(totalPaid)}</strong>
            <small>{paidEntries.length} order{paidEntries.length === 1 ? "" : "s"}</small>
          </div>
          <div className="payment-summary-card">
            <span>Last payment</span>
            <strong>{date(lastPaid)}</strong>
            <small>{lastPaid ? "Most recent confirmed payment" : "No payment yet"}</small>
          </div>
          <div className="payment-summary-card">
            <span>Online selected</span>
            <strong>{money(totalSelected)}</strong>
            <small>{onlineEntries.length} not charged yet</small>
          </div>
          <div className="payment-summary-card">
            <span>Records</span>
            <strong>{entries.length}</strong>
            <small>Paid and online selections</small>
          </div>
        </div>

        {entries.length ? (
          <div className="delivery-filters payment-filters">
            {filters.map((item) => (
              <button
                className={`delivery-filter${filter === item.id ? " is-active" : ""}`}
                type="button"
                key={item.id}
                onClick={() => setFilter(item.id)}
              >
                {item.label}<b>{item.count}</b>
              </button>
            ))}
          </div>
        ) : null}

        {loading ? (
          <p className="panel-copy">Loading your payments...</p>
        ) : entries.length === 0 ? (
          <div className="delivery-empty">
            <Icon name="chart" size={22} />
            <h4>No payments yet</h4>
            <p className="panel-copy">Paid online orders and pickup orders you collected will appear here with their amount and date.</p>
            <Link href="/patient/orders" className="platform-secondary">Go to order board <Icon name="arrow" size={15} /></Link>
          </div>
        ) : visible.length === 0 ? (
          <div className="delivery-empty">
            <Icon name="file" size={22} />
            <h4>Nothing in this view</h4>
            <p className="panel-copy">No payment matches this filter.</p>
            <button className="platform-secondary" type="button" onClick={() => setFilter("all")}>Show all payments</button>
          </div>
        ) : (
          <div className="payment-lines">
            {visible.map((entry) => (
              <article className={`payment-line${entry.paid ? " is-paid" : " is-pending"}`} data-method={entry.method} key={entry.key}>
                <span className="payment-line-icon"><Icon name={methodIcon(entry.method)} size={17} /></span>
                <div className="payment-line-main">
                  <strong>{entry.reference}</strong>
                  <span className="payment-line-meta">
                    {[
                      entry.pharmacy,
                      entry.fulfillment === "PICKUP" ? "Pickup" : entry.fulfillment === "DELIVERY" ? "Delivery" : "",
                      entry.methodText,
                    ].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <span className="payment-line-date">{entry.paid ? dateTime(entry.paidAt) : `Selected ${date(entry.selectedAt)}`}</span>
                <span className="payment-line-amount">{money(entry.amount)}</span>
                <StatusBadge tone={entry.paid ? "success" : "warning"}>{entry.statusLabel}</StatusBadge>
              </article>
            ))}
          </div>
        )}
      </section>
    </PlatformShell>
  );
}
