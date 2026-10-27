"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, Fragment, ReactNode, useEffect, useState } from "react";
import { api, type OrderCheckout } from "@/lib/api";
import { deliveredRequestCount, summarizePatientPayments } from "@/lib/patient-metrics";
import { PharmacyAssistant } from "./pharmacy-assistant";
import { DataTable, Icon, MetricCard, PageToolbar, PlatformShell, Role, StatusBadge } from "./platform";

type RecordValue = Record<string, unknown>;
type View = "home" | "requests" | "orders" | "delivery" | "payment" | "pharmacies" | "jobs" | "history" | "earnings" | "drivers" | "invitations" | "reports" | "verification" | "users" | "complaints";

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

function date(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf()) ? text(value) : parsed.toLocaleDateString("en", { dateStyle: "medium" });
}

function money(value: unknown) {
  return typeof value === "number" ? `${(value / 100).toLocaleString("en-DZ")} DZD` : text(value);
}

function tone(status: unknown): "success" | "warning" | "neutral" {
  const value = String(status ?? "").toUpperCase();
  return value.includes("COMPLETE") || value.includes("DELIVER") || value.includes("READY") || value.includes("ACTIVE") || value.includes("VERIF") ? "success" : value.includes("PENDING") || value.includes("WAIT") || value.includes("NEW") || value.includes("OPEN") ? "warning" : "neutral";
}

function useApi<T>(loader: () => Promise<T>, dependencies: unknown[] = []) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    // A dependency change starts a fresh request; the initial state remains loading until it resolves.
    loader().then((result) => { if (active) setValue(result); }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load data."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  // The caller controls refresh by changing the explicit dependency list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  return { value, error, loading };
}

function ApiState({ loading, error, children }: { loading: boolean; error: string; children: ReactNode }) {
  if (loading) return <section className="platform-panel"><p className="panel-copy">Loading live data...</p></section>;
  if (error) return <div className="form-error" role="alert">{error}</div>;
  return <>{children}</>;
}

function statusCell(value: unknown) {
  return <StatusBadge tone={tone(value)}>{text(value).replaceAll("_", " ")}</StatusBadge>;
}

function rowsFor(items: RecordValue[], columns: [string, string][]) {
  return items.map((item) => columns.map(([, key], index) => index === columns.length - 1 ? statusCell(item[key]) : <span className="muted" key={key}>{text(item[key])}</span>));
}

export function PatientRoutes({ view = "home" }: { view?: string }) {
  const current = view as View;
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (current !== "delivery") return;
    const timer = window.setInterval(() => setRefresh((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, [current]);
  const requests = useApi(() => api.requests({ limit: 100 }), [current, refresh]);
  const orders = useApi(() => api.orders({ limit: 100 }), [current, refresh]);
  const pharmacies = useApi(() => api.pharmaciesNearby(), [current]);
  const title = current === "requests" ? "My requests" : current === "orders" ? "Order board" : current === "delivery" ? "Delivery" : current === "payment" ? "Payment history" : current === "pharmacies" ? "Find a pharmacy" : "Your care, in one place";
  const requestItems = records(requests.value);
  const orderItems = records(orders.value);
  const pharmacyItems = records(pharmacies.value);
  const payments = summarizePatientPayments(requestItems, orderItems);
  const deliveredCount = deliveredRequestCount(requestItems, orderItems);
  return <PlatformShell role="patient" title={title}><div className="welcome-strip"><div><span className="platform-kicker">PATIENT SPACE</span><h2>{title}</h2><p>Live information from your DEWA account.</p></div><StatusBadge tone="success">Account active</StatusBadge></div>
    {current === "home" && <><div className="metrics-grid"><MetricCard label="Requests" value={String(requestItems.length)} detail="Prescriptions you submitted" /><MetricCard label="Orders" value={String(orderItems.length)} detail="Accepted pharmacy offers" tone="purple" /><MetricCard label="Delivered" value={String(deliveredCount)} detail="Orders received at home" tone="amber" /><MetricCard label="Paid" value={money(payments.total_paid_centimes)} detail={`${payments.paid_count} settled payment${payments.paid_count === 1 ? "" : "s"}`} tone="purple" /></div><div className="patient-dashboard-grid"><section className="platform-panel"><div className="panel-title"><div><span className="platform-kicker">RECENT REQUESTS</span><h3>Your latest activity</h3></div><Link href="/patient/requests" className="panel-link">View all <Icon name="arrow" size={15} /></Link></div><ApiState {...requests}><DataTable headers={["Reference", "Created", "Offers", "Status"]} rows={rowsFor(requestItems.slice(0, 5), [["reference", "reference"], ["created_at", "created_at"], ["offers_count", "offers_count"], ["status", "status"]])} /></ApiState></section><section className="platform-panel chatbot-panel"><span className="platform-kicker">DEWA ASSISTANT</span><h3>Ask about your medication</h3><p className="panel-copy">Chat with our medication assistant to understand your treatment and prepare questions for your pharmacist.</p><div className="chatbot-preview"><span><Icon name="shield" size={16} /> Medication guidance will be available here.</span></div><div className="chatbot-input"><input placeholder="Ask a question about your medication..." disabled /><button className="platform-primary" disabled>Send</button></div><small className="muted">Design preview — assistant functionality coming soon.</small></section></div></>}
    {current === "requests" && <ApiState {...requests}><section className="platform-panel"><PageToolbar action={<Link href="/patient/requests/new" className="platform-secondary"><Icon name="plus" size={15} /> New request</Link>} /><DataTable headers={["Reference", "Location", "Created", "Offers", "Status"]} rows={requestItems.map((item) => [<strong key="reference">{text(item.reference ?? item.id)}</strong>, <span className="muted" key="location">{text([item.wilaya_name_fr ?? item.wilaya_name, item.commune_name_fr ?? item.commune_name].filter(Boolean).join(" — "), "Location not set")}</span>, <span className="muted" key="created">{date(item.created_at)}</span>, <span className="muted" key="offers">{text(item.offers_count, "0")}</span>, statusCell(item.status)])} /></section></ApiState>}
    {current === "orders" && <PatientOrderBoard requests={requests} orders={orders} />}
    {current === "delivery" && <PatientDeliveryTracking requests={requests} orders={orders} />}
    {current === "payment" && <ApiState {...orders}><section className="platform-panel"><div className="panel-title"><div><span className="platform-kicker">PAYMENT HISTORY</span><h3>What you have paid</h3></div><StatusBadge tone="success">{money(payments.total_paid_centimes)} paid · {payments.paid_count} order{payments.paid_count === 1 ? "" : "s"}</StatusBadge></div><DataTable headers={["Order", "Paid on", "Amount", "Payment status"]} rows={orderItems.map((item) => [<strong key="id">{text(item.reference ?? item.id)}</strong>, <span className="muted" key="date">{date(item.paid_at ?? item.created_at)}</span>, <span className="muted" key="amount">{money(item.total_centimes)}</span>, statusCell(item.payment_status ?? item.status)])} /></section></ApiState>}
    {current === "pharmacies" && <ApiState {...pharmacies}><section className="platform-panel"><PageToolbar /><DataTable headers={["Pharmacy", "Area", "Distance", "Availability"]} rows={pharmacyItems.map((item) => [<strong key="name">{text(item.name_fr ?? item.name)}</strong>, <span className="muted" key="area">{text(item.commune_name ?? item.address)}</span>, <span className="muted" key="distance">{item.distance_m === undefined ? "—" : `${(Number(item.distance_m) / 1000).toFixed(1)} km`}</span>, statusCell(item.open_now ? "OPEN" : "CLOSED")])} /></section></ApiState>}
  </PlatformShell>;
}

type OrderBoardApi = { value: unknown; error: string; loading: boolean };
type FulfillmentChoice = "PICKUP" | "DELIVERY";
type PaymentChoice = "ON_DELIVERY" | "CCP" | "BARIDIMOB";
type BoardStage = "fulfillment" | "delivery" | "payment" | "done";
type SavedCheckout = { fulfillment: FulfillmentChoice; companyId: string; payment: PaymentChoice };

const CLOSED_ORDER_STATUSES = ["COMPLETED", "DELIVERED", "CANCELLED", "REFUNDED", "FAILED"];
const PAYMENT_LABELS: Record<PaymentChoice, string> = { ON_DELIVERY: "Pay on delivery", CCP: "CCP", BARIDIMOB: "BaridiMob" };

function moneyValue(value: unknown) {
  if (typeof value === "number") return money(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return money(parsed);
  }
  return "—";
}

function fulfillmentLabel(value: unknown) {
  const normalized = String(value ?? "").toUpperCase();
  return normalized === "DELIVERY" ? "Home delivery" : normalized === "PICKUP" ? "Pickup" : "Not chosen";
}

function paymentBoardLabel(request: RecordValue | null, order: RecordValue | null) {
  const method = String(request?.payment_method ?? "").toUpperCase();
  const paymentStatus = String(request?.payment_status ?? "").toUpperCase();
  const orderStatus = String(order?.status ?? "").toUpperCase();
  if (paymentStatus === "PAID" || ["PAYMENT_CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "DELIVERY_ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED"].includes(orderStatus)) return "Paid";
  if (method === "ON_DELIVERY") return "Pay on delivery";
  if (method === "CCP") return "CCP · not charged";
  if (method === "BARIDIMOB") return "BaridiMob · not charged";
  if (["AWAITING_PAYMENT", "PAYMENT_PENDING", "PHARMACIST_VALIDATION_PENDING"].includes(orderStatus)) return "Payment pending";
  return "Not chosen";
}

function deliveryCompanyLabel(request: RecordValue | null, order: RecordValue | null) {
  const fulfillment = String(request?.fulfillment_type ?? order?.fulfillment_type ?? "").toUpperCase();
  if (fulfillment !== "DELIVERY") return "—";
  return text(request?.delivery_company_name, "DEWA to assign");
}

function boardAmount(request: RecordValue | null, order: RecordValue | null) {
  return moneyValue(order?.total_centimes ?? request?.accepted_amount_centimes);
}

function deliveryArea(order: RecordValue) {
  const snapshot = order.delivery_address && typeof order.delivery_address === "object" ? order.delivery_address as RecordValue : null;
  if (!snapshot) return "";
  return [snapshot.street_line, snapshot.commune_name_fr ?? snapshot.commune_name, snapshot.wilaya_name_fr ?? snapshot.wilaya_name].filter(Boolean).join(" · ");
}

function requestLocation(request: RecordValue) {
  return [request.wilaya_name_fr ?? request.wilaya_name, request.commune_name_fr ?? request.commune_name].filter(Boolean).join(" — ");
}

function dateTime(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf()) ? text(value) : parsed.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

function progressLabel(value: unknown, fulfillment: unknown, company: unknown) {
  const status = String(value ?? "").toUpperCase();
  const type = String(fulfillment ?? "").toUpperCase();
  if (status === "PREPARING") return "Pharmacy preparing";
  if (status === "READY") return type === "DELIVERY" ? "Ready for the delivery company" : "Ready for pickup";
  if (status === "HANDED_TO_DELIVERY") return `With ${text(company, "the delivery company")} · on the way`;
  if (status === "DELIVERED") return "Delivered";
  if (status === "PICKED_UP") return "Picked up";
  return "";
}

function orderProgressLabel(value: unknown, fulfillment: unknown) {
  const status = String(value ?? "").toUpperCase();
  const type = String(fulfillment ?? "").toUpperCase();
  if (status === "AWAITING_PAYMENT") return "Awaiting payment";
  if (status === "PAYMENT_PENDING") return "Payment pending";
  if (status === "PAYMENT_CONFIRMED") return "Payment confirmed";
  if (status === "PHARMACIST_VALIDATION_PENDING") return "Pharmacist validation";
  if (status === "PREPARING") return "Pharmacy preparing";
  if (status === "READY_FOR_PICKUP") return type === "PICKUP" ? "Ready for pickup" : "Ready for the delivery company";
  if (status === "DELIVERY_ASSIGNED") return "Courier assigned";
  if (status === "PICKED_UP" || status === "OUT_FOR_DELIVERY") return "On the way";
  if (status === "DELIVERED") return "Delivered";
  if (status === "COMPLETED") return "Picked up";
  if (status === "CANCELLED") return "Cancelled";
  if (status.startsWith("REFUND") || status === "FAILED") return "Not completed";
  return text(status).replaceAll("_", " ").toLowerCase();
}

function manualProgress(value: unknown, fulfillment: unknown) {
  const status = String(value ?? "").toUpperCase();
  const type = String(fulfillment ?? "").toUpperCase();
  if (status === "PREPARING") return 1;
  if (status === "READY") return 2;
  if (status === "HANDED_TO_DELIVERY") return type === "DELIVERY" ? 3 : 0;
  if (status === "DELIVERED") return 5;
  if (status === "PICKED_UP") return 4;
  return status ? 0 : null;
}

function orderProgress(value: unknown, fulfillment: unknown) {
  const status = String(value ?? "").toUpperCase();
  const type = String(fulfillment ?? "").toUpperCase();
  if (!status) return null;
  if (["AWAITING_PAYMENT", "PAYMENT_PENDING", "PHARMACIST_VALIDATION_PENDING"].includes(status)) return 0;
  if (["PAYMENT_CONFIRMED", "PREPARING"].includes(status)) return 1;
  if (status === "READY_FOR_PICKUP") return 2;
  if (status === "DELIVERY_ASSIGNED") return type === "DELIVERY" ? 2 : null;
  if (status === "PICKED_UP") return type === "DELIVERY" ? 3 : 3;
  if (status === "OUT_FOR_DELIVERY") return 3;
  if (status === "DELIVERED") return 5;
  if (status === "COMPLETED") return 4;
  return 0;
}

function resolvedProgress(request: RecordValue | null, order: RecordValue | null) {
  const fulfillment = request?.fulfillment_type ?? order?.fulfillment_type;
  const manual = manualProgress(request?.fulfillment_status, fulfillment);
  const fromOrder = orderProgress(order?.status, fulfillment);
  if (manual === null) return fromOrder;
  if (fromOrder === null) return manual;
  return Math.max(manual, fromOrder);
}

function boardProgress(request: RecordValue | null, order: RecordValue | null) {
  const fulfillment = request?.fulfillment_type ?? order?.fulfillment_type;
  const manual = manualProgress(request?.fulfillment_status, fulfillment);
  const fromOrder = orderProgress(order?.status, fulfillment);
  if (manual === null && fromOrder === null) return request?.checkout_completed_at ? "Pharmacy preparing" : "Awaiting patient choice";
  if (fromOrder === null || (manual !== null && manual >= fromOrder)) return progressLabel(request?.fulfillment_status, fulfillment, request?.delivery_company_name);
  return orderProgressLabel(order?.status, fulfillment);
}

type DeliveryStepState = "done" | "active" | "todo";

function deliverySteps(fulfillment: string, progress: number) {
  const labels = fulfillment === "PICKUP"
    ? ["Accepted", "Preparing", "Ready for pickup", "Picked up"]
    : ["Accepted", "Preparing", "Ready for courier", "With delivery company", "Delivered"];
  return labels.map((label, index) => ({
    label,
    state: (index < progress ? "done" : index === progress ? "active" : "todo") as DeliveryStepState,
  }));
}

function orderItemLines(order: RecordValue | null) {
  const items = order?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is RecordValue => Boolean(item && typeof item === "object"))
    .map((item) => ({ name: text(item.name, "Item"), quantity: Number(item.quantity ?? 1) }));
}

type DeliveryFilter = "all" | "active" | "completed";

function PatientDeliveryTracking({ requests, orders }: { requests: OrderBoardApi; orders: OrderBoardApi }) {
  const [filter, setFilter] = useState<DeliveryFilter>("all");
  const requestById = new Map(records(requests.value).map((request) => [String(request.id ?? ""), request]));
  const matchedRequests = new Set<string>();
  const entries: { request: RecordValue; order: RecordValue | null; key: string }[] = records(orders.value).map((order) => {
    const requestId = String(order.request_id ?? "");
    if (requestId) matchedRequests.add(requestId);
    return { request: requestById.get(requestId) ?? {}, order, key: `order-${String(order.id ?? order.reference ?? requestId)}` };
  });
  records(requests.value).forEach((request) => {
    const requestId = String(request.id ?? "");
    if (!requestId || matchedRequests.has(requestId)) return;
    const requestStatus = String(request.status ?? "").toUpperCase();
    const relevant = ["ACCEPTED", "OFFER_ACCEPTED"].includes(requestStatus) || !!request.fulfillment_type || !!request.checkout_completed_at;
    if (!relevant) return;
    matchedRequests.add(requestId);
    entries.push({ request, order: null, key: `request-${requestId}` });
  });

  const rows = entries.map(({ request, order, key }) => {
    const fulfillment = String(request.fulfillment_type ?? order?.fulfillment_type ?? "").toUpperCase();
    const progress = resolvedProgress(request, order) ?? (request.checkout_completed_at ? 1 : 0);
    const label = boardProgress(request, order);
    const closed = label === "Delivered" || label === "Picked up";
    const cancelled = label === "Cancelled" || label === "Not completed";
    const pharmacy = order?.pharmacy && typeof order.pharmacy === "object" ? order.pharmacy as RecordValue : null;
    const pharmacyName = text(request.accepted_pharmacy_name_fr ?? pharmacy?.name_fr ?? pharmacy?.name, "Pharmacy");
    const pharmacyAddress = text(pharmacy?.address_line, "");
    const orderReference = String(order?.reference ?? "");
    const requestReference = String(request.reference ?? "");
    const reference = orderReference || requestReference || text(order?.id ?? request.id);
    const modeLabel = fulfillment === "PICKUP" ? "Pickup order" : fulfillment === "DELIVERY" ? "Home delivery" : "Accepted request";
    const area = fulfillment === "DELIVERY" ? (order ? deliveryArea(order) : requestLocation(request)) : "";
    const items = orderItemLines(order);
    const updatedAt = request.fulfillment_updated_at ?? request.checkout_completed_at ?? order?.updated_at ?? request.updated_at ?? request.created_at;
    return {
      key, request, order, fulfillment, progress, label, closed, cancelled,
      pharmacyName, pharmacyAddress, reference, requestReference, modeLabel, area, items,
      updatedAt,
      placedAt: order?.created_at ?? request.created_at,
    };
  });
  rows.sort((a, b) => {
    const rank = (row: typeof a) => row.cancelled ? 2 : row.closed ? 1 : 0;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const at = new Date(String(a.updatedAt ?? "")).valueOf();
    const bt = new Date(String(b.updatedAt ?? "")).valueOf();
    return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
  });

  const activeRows = rows.filter((row) => !row.closed && !row.cancelled);
  const completedRows = rows.filter((row) => row.closed && !row.cancelled);
  const onTheWayRows = activeRows.filter((row) => row.label.toLowerCase().includes("on the way"));
  const readyRows = activeRows.filter((row) => row.label.startsWith("Ready"));
  const visibleRows = filter === "active" ? activeRows : filter === "completed" ? completedRows : rows;
  const filters: { id: DeliveryFilter; label: string; count: number }[] = [
    { id: "all", label: "All orders", count: rows.length },
    { id: "active", label: "In progress", count: activeRows.length },
    { id: "completed", label: "Completed", count: completedRows.length },
  ];

  const cards = visibleRows.map((row) => {
    const steps = deliverySteps(row.fulfillment, row.progress);
    const itemLabel = `${row.items.length} item${row.items.length === 1 ? "" : "s"}`;
    return <article className={`delivery-order${row.closed ? " is-complete" : row.cancelled ? " is-cancelled" : ""}`} data-mode={row.fulfillment.toLowerCase()} key={row.key}>
      <header className="delivery-order-head">
        <span className="delivery-order-icon"><Icon name={row.fulfillment === "PICKUP" ? "store" : "truck"} size={20} /></span>
        <div className="delivery-order-heading">
          <span className="delivery-order-kicker">{row.modeLabel}</span>
          <h3>{row.reference}</h3>
          <div className="delivery-order-sub">
            {row.order && row.requestReference && row.requestReference !== row.reference ? <span>Request {row.requestReference}</span> : null}
            {row.area ? <span>{row.area}</span> : null}
            {!row.fulfillment ? <span>Awaiting your pickup or delivery choice</span> : null}
          </div>
        </div>
        <StatusBadge tone={row.closed ? "success" : row.cancelled ? "neutral" : "warning"}>{row.label || "Awaiting update"}</StatusBadge>
      </header>

      <div className="delivery-order-meta">
        <div className="delivery-meta-tile"><span>Pharmacy</span><strong>{row.pharmacyName}</strong>{row.pharmacyAddress ? <small>{row.pharmacyAddress}</small> : null}</div>
        {row.fulfillment === "DELIVERY" ? (
          <div className="delivery-meta-tile"><span>Delivery partner</span><strong>{text(row.request.delivery_company_name, "DEWA will assign a partner")}</strong><small>{row.area ? `Deliver to ${row.area}` : "Address shared with the courier"}</small></div>
        ) : row.fulfillment === "PICKUP" ? (
          <div className="delivery-meta-tile"><span>Collection</span><strong>At the pharmacy</strong><small>Bring order {row.reference}</small></div>
        ) : (
          <div className="delivery-meta-tile"><span>Fulfillment</span><strong>Not chosen yet</strong><small>Choose pickup or delivery</small></div>
        )}
        <div className="delivery-meta-tile"><span>Placed</span><strong>{date(row.placedAt)}</strong><small>{row.items.length ? itemLabel : "Prescription order"}</small></div>
        <div className="delivery-meta-tile"><span>Last update</span><strong>{dateTime(row.updatedAt)}</strong></div>
      </div>

      {row.fulfillment && !row.cancelled ? (
        <div className="delivery-journey">
          <div className="delivery-journey-head"><span>ORDER PROGRESS</span><strong>{row.label}</strong></div>
          <ol className="delivery-stepper">
            {steps.map((step, index) => <li className={`delivery-stepper-step ${step.state}`} key={step.label}><i>{step.state === "done" ? "✓" : index + 1}</i><span>{step.label}</span></li>)}
          </ol>
        </div>
      ) : !row.fulfillment ? (
        <div className="delivery-order-note"><Icon name="file" size={16} /><span>Your pharmacy accepted this request. Choose pickup or delivery to start live tracking.</span><Link href="/patient/orders">Choose now</Link></div>
      ) : null}

      <div className="delivery-order-bottom">
        <div className="delivery-order-items">
          <span>ORDER CONTENTS</span>
          {row.items.length ? (
            <div className="delivery-item-chips">
              {row.items.slice(0, 5).map((item, index) => <span className="delivery-item-chip" key={`${item.name}-${index}`}>{item.quantity}× {item.name}</span>)}
              {row.items.length > 5 ? <span className="delivery-item-chip muted">+{row.items.length - 5} more</span> : null}
            </div>
          ) : <p>Prescription items confirmed by your pharmacy.</p>}
        </div>
        <div className="delivery-order-total">
          <span>TOTAL TO PAY</span>
          <strong>{boardAmount(row.request, row.order)}</strong>
          <small>{paymentBoardLabel(row.request, row.order)}</small>
        </div>
      </div>
    </article>;
  });

  return <ApiState loading={requests.loading || orders.loading} error={requests.error || orders.error}>
    <section className="platform-panel delivery-hub">
      <div className="panel-title">
        <div><span className="platform-kicker">LIVE DELIVERY TRACKING</span><h3>Track each order separately</h3></div>
        <StatusBadge tone={activeRows.length ? "success" : "neutral"}>{activeRows.length ? `${activeRows.length} active` : "All settled"}</StatusBadge>
      </div>
      <p className="panel-copy">Every order keeps its own reference, pharmacy, delivery partner and progress so you can tell them apart at a glance. This page refreshes every 30 seconds.</p>
      {rows.length ? <div className="delivery-summary">
        <div><strong>{activeRows.length}</strong><span>Active</span></div>
        <div><strong>{onTheWayRows.length}</strong><span>On the way</span></div>
        <div><strong>{readyRows.length}</strong><span>Ready</span></div>
        <div><strong>{completedRows.length}</strong><span>Completed</span></div>
      </div> : null}
      {rows.length ? <div className="delivery-filters">
        {filters.map((item) => <button className={`delivery-filter${filter === item.id ? " is-active" : ""}`} type="button" key={item.id} onClick={() => setFilter(item.id)}>{item.label}<b>{item.count}</b></button>)}
      </div> : null}
      {rows.length === 0 ? <div className="delivery-empty"><Icon name="truck" size={22} /><h4>No accepted orders yet</h4><p className="panel-copy">When a pharmacy accepts your request, its pickup or delivery progress will appear here.</p><Link href="/patient/orders" className="platform-secondary">Go to order board <Icon name="arrow" size={15} /></Link></div>
        : cards.length ? <div className="delivery-orders-list">{cards}</div>
        : <div className="delivery-empty"><Icon name="file" size={22} /><h4>Nothing in this view</h4><p className="panel-copy">You have no {filter === "completed" ? "completed" : "active"} orders right now.</p><button className="platform-secondary" type="button" onClick={() => setFilter("all")}>Show all orders</button></div>}
    </section>
  </ApiState>;
}

function PatientOrderBoard({ requests, orders }: { requests: OrderBoardApi; orders: OrderBoardApi }) {
  const requestItems = records(requests.value);
  const orderItems = records(orders.value);
  const orderByRequest = new Map(orderItems.map((order) => [String(order.request_id ?? ""), order]));
  const [selected, setSelected] = useState<RecordValue | null>(null);
  const selectedOrder = selected ? orderByRequest.get(String(selected.id ?? "")) ?? null : null;
  const selectedOrderId = selectedOrder ? String(selectedOrder.id ?? "") : "";
  const [stage, setStage] = useState<BoardStage>("fulfillment");
  const [fulfillment, setFulfillment] = useState<FulfillmentChoice | "">("");
  const [companyId, setCompanyId] = useState("");
  const [payment, setPayment] = useState<PaymentChoice | "">("");
  const [companies, setCompanies] = useState<RecordValue[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [companiesError, setCompaniesError] = useState("");
  const [checkout, setCheckout] = useState<OrderCheckout | null>(null);
  const [saved, setSaved] = useState<Record<string, SavedCheckout>>({});
  const [finishing, setFinishing] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let active = true;
    api.deliveryCompanies().then((value) => {
      if (active) setCompanies(records(value));
    }).catch((reason) => {
      if (active) setCompaniesError(reason instanceof Error ? reason.message : "Unable to load delivery companies.");
    }).finally(() => {
      if (active) setCompaniesLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedOrderId) return;
    let active = true;
    api.orderCheckout(selectedOrderId).then((value) => {
      if (active) setCheckout(value);
    }).catch(() => {
      // The order itself already carries the same totals; keep those as fallback.
    });
    return () => { active = false; };
  }, [selectedOrderId]);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selected]);

  function openRequest(request: RecordValue) {
    const requestId = String(request.id ?? "");
    const existing = saved[requestId];
    const linkedOrder = orderByRequest.get(requestId);
    const fulfillmentValue = String(existing?.fulfillment ?? linkedOrder?.fulfillment_type ?? request.fulfillment_type ?? "").toUpperCase();
    const paymentValue = String(existing?.payment ?? request.payment_method ?? "").toUpperCase();
    setSelected(request);
    setStage("fulfillment");
    setSaveError("");
    setFulfillment(fulfillmentValue === "PICKUP" || fulfillmentValue === "DELIVERY" ? fulfillmentValue : "");
    setPayment(paymentValue === "ON_DELIVERY" || paymentValue === "CCP" || paymentValue === "BARIDIMOB" ? paymentValue : "");
    setCompanyId(existing?.companyId ?? (request.delivery_company_id ? String(request.delivery_company_id) : (request.checkout_completed_at && fulfillmentValue === "DELIVERY" ? "auto" : "")));
    setCheckout(null);
  }

  function close() {
    setSelected(null);
    setStage("fulfillment");
    setCheckout(null);
    setSaveError("");
  }

  function companyLabel(id: string) {
    if (id === "auto") return "Best available partner";
    return text(companies.find((company) => String(company.id) === id)?.name, "Selected delivery company");
  }

  function chooseFulfillment(choice: FulfillmentChoice) {
    setFulfillment(choice);
    if (choice === "PICKUP") setCompanyId("");
  }

  function continueFromFulfillment() {
    if (!fulfillment) return;
    setStage(fulfillment === "DELIVERY" ? "delivery" : "payment");
  }

  async function finish() {
    if (!selected || !fulfillment || !payment) return;
    if (fulfillment === "DELIVERY" && !companyId) return;
    setFinishing(true);
    setSaveError("");
    try {
      await api.requestCheckout(String(selected.id), {
        fulfillment_type: fulfillment,
        delivery_company_id: fulfillment === "DELIVERY" && companyId !== "auto" ? companyId : null,
        payment_method: payment,
      });
      setSaved((current) => ({
        ...current,
        [String(selected.id)]: { fulfillment, companyId, payment },
      }));
      setStage("done");
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "Unable to save your order choices.");
    } finally {
      setFinishing(false);
    }
  }

  const acceptedAmount = Number(selected?.accepted_amount_centimes ?? 0) || 0;
  const checkoutTotal = checkout?.total_centimes ?? (Number(selectedOrder?.total_centimes ?? 0) || acceptedAmount);
  const checkoutItems = checkout?.items_subtotal_centimes ?? (Number(selectedOrder?.items_subtotal_centimes ?? 0) || acceptedAmount);
  const checkoutDelivery = checkout?.delivery_fee_centimes ?? Number(selectedOrder?.delivery_fee_centimes ?? 0);
  const checkoutService = checkout?.service_fee_centimes ?? Number(selectedOrder?.service_fee_centimes ?? 0);
  const hasOrder = Boolean(selectedOrder);
  const hasAmount = (hasOrder && (checkoutTotal > 0 || checkoutItems > 0)) || acceptedAmount > 0;
  const onlinePayment = payment === "CCP" || payment === "BARIDIMOB";
  const steps: [BoardStage, string][] = fulfillment === "DELIVERY"
    ? [["fulfillment", "Fulfillment"], ["delivery", "Delivery company"], ["payment", "Payment"]]
    : [["fulfillment", "Fulfillment"], ["payment", "Payment"]];
  const stepIndex = steps.findIndex(([key]) => key === stage);
  const pharmacyName = text((selectedOrder?.pharmacy as RecordValue | undefined)?.name_fr ?? (selectedOrder?.pharmacy as RecordValue | undefined)?.name, "") || text(selected?.accepted_pharmacy_name_fr, "");
  const pharmacyLabel = pharmacyName || "the pharmacy";
  const location = selected ? requestLocation(selected) : "";
  const destination = (selectedOrder ? deliveryArea(selectedOrder) : "") || location;
  const summaryLine = [pharmacyName, location].filter(Boolean).join(" · ") || "Accepted request";
  const paymentOptions: { value: PaymentChoice; label: string; detail: string; icon: "cart" | "file" | "chart" }[] = [
    { value: "ON_DELIVERY", label: "Pay on delivery", detail: "Cash or card when the order reaches you.", icon: "cart" },
    { value: "CCP", label: "CCP – Algérie Poste", detail: "Transfer from your CCP account.", icon: "file" },
    { value: "BARIDIMOB", label: "BaridiMob", detail: "Pay from the BaridiMob mobile app.", icon: "chart" },
  ];

  return <ApiState {...requests}>
    <section className="platform-panel">
      <PageToolbar action={<StatusBadge tone="success">{requestItems.length} request{requestItems.length === 1 ? "" : "s"}</StatusBadge>} />
      <p className="panel-copy order-board-intro">All your requests in one place. When a pharmacy accepts your request, click the accepted status to choose pickup or home delivery, select a delivery company and choose how to pay.</p>
      <DataTable headers={["Reference", "Location", "Created", "Offers", "Status"]} rows={requestItems.map((item) => {
        const requestId = String(item.id ?? "");
        const choice = saved[requestId];
        const status = String(item.status ?? "").toUpperCase();
        const linkedOrder = orderByRequest.get(requestId);
        const closed = linkedOrder ? CLOSED_ORDER_STATUSES.includes(String(linkedOrder.status ?? "").toUpperCase()) : false;
        const accepted = status === "ACCEPTED" || status === "OFFER_ACCEPTED";
        return [
          <strong key="reference">{text(item.reference ?? item.id)}</strong>,
          <span className="muted" key="location">{text(requestLocation(item), "Location not set")}</span>,
          <span className="muted" key="created">{date(item.created_at)}</span>,
          <span className="muted" key="offers">{text(item.offers_count, "0")}</span>,
          <div className="order-status-cell" key="status">
            {accepted && !closed
              ? <button className="status-badge success order-accepted-button" type="button" onClick={() => openRequest(item)}>{status === "ACCEPTED" ? "Accepted" : "Offer accepted"} <Icon name="arrow" size={12} /></button>
              : statusCell(item.status)}
            {accepted && !!item.accepted_amount_centimes && <small className="order-choice">Amount to pay: {moneyValue(item.accepted_amount_centimes)}</small>}
            {!choice && (item.fulfillment_type || item.payment_method) && <small className="order-choice">{fulfillmentLabel(item.fulfillment_type)} · {paymentBoardLabel(item, null)}</small>}
            {choice && <small className="order-choice">{choice.fulfillment === "DELIVERY" ? "Delivery" : "Pickup"} · {PAYMENT_LABELS[choice.payment]}</small>}
          </div>,
        ];
      })} />
    </section>

    {selected && <div className="order-modal-backdrop" onClick={close}>
      <div className="order-modal" role="dialog" aria-modal="true" aria-labelledby="order-modal-title" onClick={(event) => event.stopPropagation()}>
        <div className="order-modal-header">
          <div>
            <span className="platform-kicker">{stage === "done" ? "REQUEST ACCEPTED" : `REQUEST ${text(selected.reference ?? selected.id)}`}</span>
            <h2 id="order-modal-title">{stage === "done" ? (onlinePayment ? "Online payment coming soon" : "Order confirmed") : "Complete your order"}</h2>
            <p className="panel-copy">{summaryLine}{hasAmount ? ` · ${moneyValue(checkoutTotal)}` : ""}</p>
          </div>
          <button className="order-modal-close" type="button" aria-label="Close" onClick={close}>×</button>
        </div>

        {stage !== "done" && <div className="order-steps">
          {steps.map(([key, label], index) => <div className={`order-step ${stage === key ? "active" : index < stepIndex ? "done" : ""}`} key={key}>
            <i>{index < stepIndex ? "✓" : index + 1}</i>{label}
          </div>)}
        </div>}

        {stage === "fulfillment" && <>
          <h3 className="order-modal-title">How would you like to get this medication?</h3>
          <p className="panel-copy">The pharmacy has accepted your request. Choose how the order should reach you.</p>
          <div className="order-option-grid">
            <button className={`order-option ${fulfillment === "PICKUP" ? "selected" : ""}`} type="button" onClick={() => chooseFulfillment("PICKUP")}>
              <span className="order-option-icon"><Icon name="store" size={19} /></span>
              <strong>I will pick it up</strong>
              <span>Collect it directly from {pharmacyLabel}.</span>
              <small>No delivery fee</small>
            </button>
            <button className={`order-option ${fulfillment === "DELIVERY" ? "selected" : ""}`} type="button" onClick={() => chooseFulfillment("DELIVERY")}>
              <span className="order-option-icon"><Icon name="truck" size={19} /></span>
              <strong>Home delivery</strong>
              <span>{destination || "Deliver to the address linked to your request."}</span>
              <small>Delivery fee applies</small>
            </button>
          </div>
          <div className="order-modal-actions">
            <button className="platform-secondary" type="button" onClick={close}>Cancel</button>
            <button className="platform-primary" type="button" disabled={!fulfillment} onClick={continueFromFulfillment}>Continue <Icon name="arrow" size={15} /></button>
          </div>
        </>}

        {stage === "delivery" && <>
          <h3 className="order-modal-title">Choose a delivery company</h3>
          <p className="panel-copy">Select the partner that should bring your order to you{destination ? ` in ${destination}` : ""}.</p>
          <div className="company-list">
            <button className={`company-option ${companyId === "auto" ? "selected" : ""}`} type="button" onClick={() => setCompanyId("auto")}>
              <span className="order-option-icon"><Icon name="shield" size={18} /></span>
              <span className="payment-option-copy"><strong>Let DEWA choose</strong><small>The nearest verified partner is assigned automatically.</small></span>
              <span className="order-radio" aria-hidden="true">{companyId === "auto" ? "✓" : ""}</span>
            </button>
            {companies.map((company) => {
              const id = String(company.id ?? "");
              return <button className={`company-option ${companyId === id ? "selected" : ""}`} type="button" key={id} onClick={() => setCompanyId(id)}>
                <span className="order-option-icon"><Icon name="truck" size={18} /></span>
                <span className="payment-option-copy"><strong>{text(company.name, "Delivery company")}</strong><small>{company.phone ? `Verified partner · ${text(company.phone)}` : "Verified delivery partner"}</small></span>
                <span className="order-radio" aria-hidden="true">{companyId === id ? "✓" : ""}</span>
              </button>;
            })}
          </div>
          {companiesLoading && <p className="panel-copy">Loading delivery partners...</p>}
          {!companiesLoading && companiesError && <p className="panel-copy">Live partner list unavailable. You can still let DEWA choose for you.</p>}
          {!companiesLoading && !companiesError && !companies.length && <p className="panel-copy">No partner is listed yet. Choose “Let DEWA choose” and our team will assign one.</p>}
          <div className="order-modal-actions">
            <button className="platform-secondary" type="button" onClick={() => setStage("fulfillment")}>Back</button>
            <button className="platform-primary" type="button" disabled={!companyId} onClick={() => setStage("payment")}>Continue <Icon name="arrow" size={15} /></button>
          </div>
        </>}

        {stage === "payment" && <>
          <h3 className="order-modal-title">Pay your order</h3>
          <p className="panel-copy">Choose how you want to settle this order.</p>
          <div className="payment-summary">
            {hasAmount && <div className="payment-summary-row"><span>Medicines</span><span>{moneyValue(checkoutItems)}</span></div>}
            {fulfillment === "DELIVERY" && <div className="payment-summary-row"><span>Delivery {companyId ? `· ${companyLabel(companyId)}` : ""}</span><span>{checkoutDelivery > 0 ? moneyValue(checkoutDelivery) : "Set by partner"}</span></div>}
            {checkoutService > 0 && <div className="payment-summary-row"><span>Service fee</span><span>{moneyValue(checkoutService)}</span></div>}
            <div className="payment-summary-row total"><span>Total</span><span>{hasAmount ? moneyValue(checkoutTotal) : "To be confirmed"}</span></div>
          </div>
          {!hasAmount && <p className="panel-copy payment-summary-note">The pharmacy will confirm the price after reviewing your prescription.</p>}
          {fulfillment === "DELIVERY" && checkoutDelivery === 0 && <p className="panel-copy payment-summary-note">The delivery fee will be confirmed by the partner before pickup.</p>}
          {saveError && <div className="form-error" role="alert">{saveError}</div>}
          <div className="payment-options">
            {paymentOptions.map((option) => <Fragment key={option.value}>
              <button className={`payment-option ${payment === option.value ? "selected" : ""}`} type="button" onClick={() => setPayment(option.value)}>
                <span className="order-option-icon"><Icon name={option.icon} size={18} /></span>
                <span className="payment-option-copy"><strong>{option.label}</strong><small>{option.detail}</small></span>
                <span className="order-radio" aria-hidden="true">{payment === option.value ? "✓" : ""}</span>
              </button>
              {payment === option.value && (option.value === "CCP" || option.value === "BARIDIMOB") && <div className="under-construction-note">
                <StatusBadge tone="warning">Under construction</StatusBadge>
                <p>Online payment with {PAYMENT_LABELS[option.value]} is under construction. You can finish your order now without paying online.</p>
              </div>}
            </Fragment>)}
          </div>
          <div className="order-modal-actions">
            <button className="platform-secondary" type="button" onClick={() => setStage(fulfillment === "DELIVERY" ? "delivery" : "fulfillment")}>Back</button>
            <button className="platform-primary" type="button" disabled={!payment || finishing} onClick={finish}>{finishing ? "Saving..." : onlinePayment ? "Done" : "Pay order"} <Icon name="arrow" size={15} /></button>
          </div>
        </>}

        {stage === "done" && <div className="order-done">
          <span className="success-mark">✓</span>
          <h3>{onlinePayment ? "Your order is saved" : "Your order is confirmed"}</h3>
          <p className="panel-copy">{onlinePayment ? "Online payment is under construction. Nothing has been charged — you can pay when the online option is available." : "Your choice is saved. Pay when your medication reaches you."}</p>
          <div className="order-done-summary">
            <div><span>Fulfillment</span><strong>{fulfillment === "DELIVERY" ? "Home delivery" : "Pickup at the pharmacy"}</strong></div>
            {fulfillment === "DELIVERY" && <div><span>Delivery company</span><strong>{companyLabel(companyId)}</strong></div>}
            <div><span>Payment</span><strong>{payment ? PAYMENT_LABELS[payment] : "—"}</strong>{onlinePayment && <small>Under construction</small>}</div>
            <div><span>Total</span><strong>{hasAmount ? moneyValue(checkoutTotal) : "To be confirmed"}</strong></div>
          </div>
          <button className="platform-primary full" type="button" onClick={close}>Back to order board</button>
        </div>}
      </div>
    </div>}
  </ApiState>;
}

export function NewRequestPage() {
  const [file, setFile] = useState<File | null>(null);
  const [wilayaId, setWilayaId] = useState("16");
  const [communeId, setCommuneId] = useState("554");
  const [wilayas, setWilayas] = useState<RecordValue[]>([]);
  const [communes, setCommunes] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    api.wilayas().then((value) => {
      const items = records(value);
      setWilayas(items);
      setWilayaId((current) => (items.length && !items.some((item) => String(item.id) === current) ? String(items[0].id) : current));
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load wilayas.")).finally(() => setLoadingLocation(false));
  }, []);

  useEffect(() => {
    if (!wilayaId) return;
    api.communes(Number(wilayaId)).then((value) => {
      const items = records(value);
      setCommunes(items);
      setCommuneId((current) => (items.some((item) => String(item.id) === current) ? current : ""));
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load communes."));
  }, [wilayaId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Please choose a prescription image or PDF.");
      return;
    }
    const selectedCommune = communeId || String(communes[0]?.id ?? "");
    if (!wilayaId || !selectedCommune) {
      setError("Please select a Wilaya with an available Commune.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const uploaded = await api.uploadFiles(file);
      const address = await api.createAddress({
        label: "Prescription request",
        wilaya_id: Number(wilayaId),
        commune_id: Number(selectedCommune),
        street_line: "Wilaya location",
        is_default: true,
      }) as { id: string };
      await api.createRequest({
        request_type: "PRESCRIPTION",
        address_id: address.id,
        file_ids: uploaded.map((item) => item.id),
        delivery_wanted: false,
        consent_to_share: true,
        urgency: "NORMAL",
      });
      setSubmitted(true);
      router.push("/patient/requests?refresh=" + Date.now());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to submit your request.");
    } finally {
      setLoading(false);
    }
  }

  const selectedWilaya = wilayas.find((item) => String(item.id) === wilayaId);
  const selectedCommune = communes.find((item) => String(item.id) === communeId);
  const locationSummary = [
    selectedWilaya ? text(selectedWilaya.name_fr ?? selectedWilaya.name, "") : "",
    selectedCommune ? text(selectedCommune.name_fr ?? selectedCommune.name, "") : "Any commune",
  ].filter(Boolean).join(" · ");

  return <PlatformShell role="patient" title="New prescription request"><section className="platform-panel request-form"><span className="platform-kicker">REQUEST</span><h2>Upload your prescription</h2><p className="panel-copy">Choose where you are located and upload your certificate. A street address is not required.</p>{submitted ? <div className="register-success"><span className="success-mark">✓</span><span className="landing-kicker">REQUEST SUBMITTED</span><h2>Your prescription is being reviewed.</h2><p>Pharmacies near your location will receive your request. You can follow its status from My requests.</p><Link href="/patient/requests" className="platform-primary">View my requests <Icon name="arrow" size={16} /></Link></div> : <form onSubmit={submit}><div className="request-location"><div className="request-location-head"><div><span className="platform-kicker">LOCATION</span><h3>Where are you?</h3><p className="panel-copy">We only use this to match you with pharmacies near you. No street address is needed.</p></div><span className="request-location-icon"><Icon name="store" size={20} /></span></div><div className="request-location-grid"><label className="location-field"><span className="location-field-label"><Icon name="grid" size={14} /> Wilaya</span><div className="location-select"><select required value={wilayaId} disabled={loadingLocation} onChange={(event) => { setWilayaId(event.target.value); setCommuneId(""); }}><option value="" disabled>{loadingLocation ? "Loading wilayas..." : "Select your Wilaya"}</option>{wilayas.map((item) => <option value={String(item.id)} key={String(item.id)}>{String(item.id)} — {text(item.name_fr ?? item.name)}</option>)}</select><Icon name="arrow" size={14} /></div></label><label className="location-field"><span className="location-field-label"><Icon name="users" size={14} /> Commune <em>optional</em></span><div className="location-select"><select value={communeId} onChange={(event) => setCommuneId(event.target.value)} disabled={loadingLocation || !communes.length}><option value="">Any commune in this Wilaya</option>{communes.map((item) => <option value={String(item.id)} key={String(item.id)}>{text(item.name_fr ?? item.name)}</option>)}</select><Icon name="arrow" size={14} /></div></label></div><div className="request-location-summary"><span className="request-location-marker"><Icon name="store" size={16} /></span><div><span>Selected location</span><strong>{locationSummary || "Choose a wilaya"}</strong></div>{communeId ? <button type="button" className="request-location-clear" onClick={() => setCommuneId("")}>Clear commune</button> : null}</div></div><label className="upload-zone"><Icon name="file" size={28} /><strong>{file ? file.name : "Choose your prescription"}</strong><span>JPG, PNG or PDF · up to 10 MB per file</span><input required type="file" accept="image/jpeg,image/png,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><label className="check-row"><input type="checkbox" defaultChecked required /> I consent to share this prescription with matched pharmacies.</label>{error && <div className="form-error" role="alert">{error}</div>}<div className="form-actions"><Link href="/patient" className="platform-secondary">Cancel</Link><button className="platform-primary" type="submit" disabled={loading || loadingLocation}>{loading ? "Uploading and submitting..." : "Submit request"} <Icon name="arrow" size={16} /></button></div><p className="panel-copy">Your request will remain visible with its current status: pending, accepted, rejected, or completed.</p></form>}</section></PlatformShell>;
}

export function PharmacyPage({ view = "home" }: { view?: string }) {
  const current = view as View;
  const summary = useApi(() => api.pharmacySummary(), [current]);
  const [requestRefresh, setRequestRefresh] = useState(0);
  const requests = useApi(() => api.pharmacyRequests({ limit: 50 }), [current, requestRefresh]);
  const orders = useApi(() => api.pharmacyOrders(), [current, requestRefresh]);
  const acceptedRequests = useApi(
    () => current === "orders" ? api.pharmacyRequests({ request_status: "ACCEPTED,OFFER_ACCEPTED", limit: 100 }) : Promise.resolve(null),
    [current, requestRefresh],
  );
  useEffect(() => {
    if (current !== "orders") return;
    const timer = window.setInterval(() => setRequestRefresh((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, [current]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [requestDetail, setRequestDetail] = useState<RecordValue | null>(null);
  const [requestDetailError, setRequestDetailError] = useState("");
  const [requestDetailLoading, setRequestDetailLoading] = useState(false);
  const [acceptingRequest, setAcceptingRequest] = useState(false);
  const [acceptAmount, setAcceptAmount] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [pendingFulfillment, setPendingFulfillment] = useState<{ requestId: string; target: "HANDED_TO_DELIVERY" | "DELIVERED" | "PICKED_UP"; label: string; detail: string } | null>(null);
  const [fulfillmentBusy, setFulfillmentBusy] = useState(false);
  const [fulfillmentError, setFulfillmentError] = useState("");
  const data = summary.value && typeof summary.value === "object" ? summary.value as RecordValue : {};
  const items = current === "requests" ? records(requests.value) : current === "orders" ? records(orders.value) : records(summary.value);
  const requestItems = records(requests.value);
  const pendingRequestCount = requestItems.filter((item) => ["SENT", "VIEWED"].includes(String(item.recipient_status ?? "").toUpperCase())).length;
  const title = current === "requests" ? "Request inbox" : current === "orders" ? "Orders board" : "Pharmacy dashboard";
  const state = current === "requests" ? requests : current === "orders" ? orders : summary;
  useEffect(() => {
    if (!selectedRequestId) return;
    let active = true;
    api.pharmacyRequest(selectedRequestId).then(async (value) => {
      const detail = (value && typeof value === "object" ? value : {}) as RecordValue;
      const canView = detail.can_view_prescription === true;
      const files = records(detail.files);
      const filesWithUrls = canView ? await Promise.all(files.map(async (file) => {
        const fileId = typeof file.file_id === "string" ? file.file_id : "";
        if (!fileId) return file;
        try {
          const access = await api.fileAccessUrl(fileId);
          return { ...file, access_url: access.url };
        } catch {
          return file;
        }
      })) : files;
      if (active) setRequestDetail({ ...detail, files: filesWithUrls });
      const quoted = Number(detail.quoted_amount_centimes ?? 0);
      if (active && quoted > 0) setAcceptAmount(String(quoted / 100));
    }).catch((reason) => {
      if (active) setRequestDetailError(reason instanceof Error ? reason.message : "Unable to load request details.");
    }).finally(() => {
      if (active) setRequestDetailLoading(false);
    });
    return () => { active = false; };
  }, [selectedRequestId]);

  function openRequest(id: string) {
    setSelectedRequestId(id);
    setRequestDetail(null);
    setRequestDetailLoading(true);
    setAcceptAmount("");
    setShowReject(false);
    setRejectReason("");
    setRequestDetailError("");
  }

  function closeRequest() {
    if (acceptingRequest) return;
    setSelectedRequestId("");
    setRequestDetail(null);
    setRequestDetailLoading(false);
    setRequestDetailError("");
    setShowReject(false);
    setRejectReason("");
    setAcceptAmount("");
  }

  async function acceptSelectedRequest() {
    if (!selectedRequestId) return;
    const amountCentimes = Math.round(Number(acceptAmount) * 100);
    if (!acceptAmount.trim() || !Number.isFinite(amountCentimes) || amountCentimes <= 0) {
      setRequestDetailError("Enter the amount the patient must pay.");
      return;
    }
    setAcceptingRequest(true);
    setRequestDetailError("");
    try {
      await api.pharmacyAcceptRequest(selectedRequestId, amountCentimes);
      const refreshed = await api.pharmacyRequest(selectedRequestId);
      setRequestDetail((refreshed && typeof refreshed === "object" ? refreshed : {}) as RecordValue);
      setRequestRefresh((value) => value + 1);
    } catch (reason) {
      setRequestDetailError(reason instanceof Error ? reason.message : "Unable to accept this request.");
    } finally {
      setAcceptingRequest(false);
    }
  }

  async function rejectSelectedRequest() {
    if (!selectedRequestId) return;
    if (rejectReason.trim().length < 3) {
      setRequestDetailError("Add a short reason (at least 3 characters) before rejecting.");
      return;
    }
    setAcceptingRequest(true);
    setRequestDetailError("");
    try {
      await api.pharmacyRejectRequest(selectedRequestId, rejectReason.trim());
      const refreshed = await api.pharmacyRequest(selectedRequestId);
      setRequestDetail((refreshed && typeof refreshed === "object" ? refreshed : {}) as RecordValue);
      setShowReject(false);
      setRejectReason("");
      setRequestRefresh((value) => value + 1);
    } catch (reasonValue) {
      setRequestDetailError(reasonValue instanceof Error ? reasonValue.message : "Unable to reject this request.");
    } finally {
      setAcceptingRequest(false);
    }
  }

  async function confirmFulfillment() {
    if (!pendingFulfillment) return;
    setFulfillmentBusy(true);
    setFulfillmentError("");
    try {
      await api.pharmacyUpdateFulfillment(pendingFulfillment.requestId, pendingFulfillment.target);
      setPendingFulfillment(null);
      setRequestRefresh((value) => value + 1);
    } catch (reason) {
      setFulfillmentError(reason instanceof Error ? reason.message : "Unable to update this order.");
    } finally {
      setFulfillmentBusy(false);
    }
  }

  function fulfillmentAction(request: RecordValue, order: RecordValue | null) {
    const requestId = String(request.request_id ?? request.id ?? "");
    const status = String(request.fulfillment_status ?? "").toUpperCase();
    const fulfillment = String(request.fulfillment_type ?? order?.fulfillment_type ?? "").toUpperCase();
    const company = text(request.delivery_company_name, "the delivery company");
    const progress = resolvedProgress(request, order);
    if (progress !== null && progress >= 5) return <StatusBadge tone="success">Delivered</StatusBadge>;
    if (fulfillment === "PICKUP" && progress !== null && progress >= 4) return <StatusBadge tone="success">Collected</StatusBadge>;
    const fromOrder = orderProgress(order?.status, fulfillment);
    if (fulfillment === "DELIVERY" && fromOrder !== null && fromOrder >= 3 && status !== "HANDED_TO_DELIVERY") return <span className="muted">With delivery company</span>;
    if (!requestId || !request.checkout_completed_at) return <span className="muted">Awaiting patient choice</span>;
    if (fulfillment === "DELIVERY") {
      if (status === "HANDED_TO_DELIVERY") {
        return <button className="table-action" type="button" onClick={() => { setFulfillmentError(""); setPendingFulfillment({ requestId, target: "DELIVERED", label: "Mark as delivered", detail: `Confirm that ${company} delivered order ${text(request.reference)} to the patient.` }); }}>Mark delivered</button>;
      }
      return <button className="table-action" type="button" onClick={() => { setFulfillmentError(""); setPendingFulfillment({ requestId, target: "HANDED_TO_DELIVERY", label: "Hand to delivery company", detail: `Confirm the parcel is now with ${company}. The patient will immediately see that it is on the way.` }); }}>Hand to company</button>;
    }
    if (fulfillment === "PICKUP") {
      return <button className="table-action" type="button" onClick={() => { setFulfillmentError(""); setPendingFulfillment({ requestId, target: "PICKED_UP", label: "Mark as picked up", detail: `Confirm the patient collected order ${text(request.reference)} at the pharmacy.` }); }}>Mark picked up</button>;
    }
    return <span className="muted">Awaiting patient choice</span>;
  }

  const requestRows = items.map((item) => {
    const requestId = String(item.request_id ?? item.id ?? "");
    return [
      <button className="table-link" type="button" key="reference" onClick={() => openRequest(requestId)}>{text(item.reference ?? item.request_id ?? item.id)}</button>,
      <span className="muted" key="sent">{date(item.sent_at ?? item.created_at)}</span>,
      <span className="muted" key="urgency">{text(item.urgency)}</span>,
      statusCell(item.recipient_status ?? item.status ?? item.request_status),
      <button className="table-action" type="button" key="review" onClick={() => openRequest(requestId)}>Review</button>,
    ];
  });
  const detailFiles = records(requestDetail?.files);
  const detailRecipientStatus = String(requestDetail?.recipient_status ?? "").toUpperCase();
  const detailRequestStatus = String(requestDetail?.request_status ?? "").toUpperCase();
  const canAcceptSelected = ["SENT", "VIEWED"].includes(detailRecipientStatus) && detailRequestStatus === "AWAITING_PHARMACY_RESPONSE";
  const acceptedRequestItems = records(acceptedRequests.value).filter((item) => {
    const requestStatus = String(item.request_status ?? item.status ?? "").toUpperCase();
    return requestStatus === "ACCEPTED" || requestStatus === "OFFER_ACCEPTED";
  });
  const pharmacyOrderByRequest = new Map(records(orders.value).map((order) => [String(order.request_id ?? ""), order]));
  const boardRequestIds = new Set<string>();
  const progressBadge = (label: string) => <StatusBadge tone={label === "Delivered" || label === "Picked up" ? "success" : label === "Cancelled" || label === "Not completed" ? "neutral" : "warning"}>{label}</StatusBadge>;
  const requestBoardRows = acceptedRequestItems.map((request) => {
    const requestId = String(request.request_id ?? request.id ?? "");
    boardRequestIds.add(requestId);
    const order = pharmacyOrderByRequest.get(requestId) ?? null;
    return [
      <strong key="reference">{text(request.reference ?? request.request_id ?? request.id)}</strong>,
      <span className="muted" key="patient">{text(request.patient_first_name)}</span>,
      <span className="muted" key="fulfillment">{fulfillmentLabel(request.fulfillment_type ?? order?.fulfillment_type)}</span>,
      <span className="muted" key="delivery">{deliveryCompanyLabel(request, order)}</span>,
      <span className="muted" key="payment">{paymentBoardLabel(request, order)}</span>,
      <span className="muted" key="amount">{boardAmount(request, order)}</span>,
      order ? statusCell(order.status) : statusCell(request.request_status ?? request.recipient_status),
      <span key="progress">{progressBadge(boardProgress(request, order))}</span>,
      <span className="board-action-cell" key="action">{fulfillmentAction(request, order)}</span>,
    ];
  });
  const orderOnlyRows = records(orders.value).filter((order) => !boardRequestIds.has(String(order.request_id ?? ""))).map((order) => [
    <strong key="reference">{text(order.reference ?? order.id)}</strong>,
    <span className="muted" key="patient">{text((order.patient as RecordValue | undefined)?.first_name)}</span>,
    <span className="muted" key="fulfillment">{fulfillmentLabel(order.fulfillment_type)}</span>,
    <span className="muted" key="delivery">—</span>,
    <span className="muted" key="payment">{paymentBoardLabel(null, order)}</span>,
    <span className="muted" key="amount">{boardAmount(null, order)}</span>,
    statusCell(order.status),
    <span key="progress">{progressBadge(orderProgressLabel(order.status, order.fulfillment_type))}</span>,
    <span className="muted" key="action">Open order</span>,
  ]);
  const orderBoardRows = [...requestBoardRows, ...orderOnlyRows];
  return <PlatformShell role="pharmacy" title={title}><div className="welcome-strip"><div><span className="platform-kicker">PHARMACY SPACE</span><h2>{title}</h2><p>Live operational data from your pharmacy account.</p></div><StatusBadge tone={tone(data.status)}> {text(data.status, "Connected")} </StatusBadge></div>{current === "home" ? <ApiState {...summary}><><div className="metrics-grid"><MetricCard label="Requests received" value={text(data.requests_received, "0")} detail="Current reporting period" /><MetricCard label="Offers sent" value={text(data.offers_sent, "0")} detail={`Accepted: ${text(data.offers_accepted, "0")}`} tone="purple" /><MetricCard label="Revenue" value={money(data.revenue_centimes)} detail="Reported by DEWA" tone="amber" /></div><PharmacyAssistant pendingRequests={pendingRequestCount} /></></ApiState> : current === "requests" ? <ApiState {...requests}><section className="platform-panel"><PageToolbar /><DataTable headers={["Request", "Sent", "Urgency", "Status", "Decision"]} rows={requestRows} /></section>{selectedRequestId && <div className="order-modal-backdrop" onClick={closeRequest}>
  <div className="order-modal request-modal" role="dialog" aria-modal="true" aria-labelledby="request-modal-title" onClick={(event) => event.stopPropagation()}>
    <div className="order-modal-header">
      <div><span className="platform-kicker">REQUEST REVIEW</span><h2 id="request-modal-title">{text(requestDetail?.reference, "Loading request...")}</h2></div>
      <button className="order-modal-close" type="button" aria-label="Close" onClick={closeRequest}>×</button>
    </div>
    {requestDetailLoading && <p className="panel-copy">Loading request and certificate...</p>}
    {requestDetailError && <div className="form-error" role="alert">{requestDetailError}</div>}
    {requestDetail && !requestDetailLoading && <>
      <div className="request-modal-meta">
        <div><span>Patient</span><strong>{text((requestDetail.patient as RecordValue | undefined)?.first_name, "Patient")} {text((requestDetail.patient as RecordValue | undefined)?.last_name, "")}</strong></div>
        <div><span>Location</span><strong>{text([requestDetail.delivery_area && (requestDetail.delivery_area as RecordValue).wilaya_name_fr, requestDetail.delivery_area && (requestDetail.delivery_area as RecordValue).commune_name_fr].filter(Boolean).join(" · "), "Not provided")}</strong></div>
        <div><span>Urgency</span><strong>{text(requestDetail.urgency, "Normal")}</strong></div>
        <div><span>Received</span><strong>{date(requestDetail.sent_at ?? requestDetail.created_at)}</strong></div>
      </div>
      {requestDetail.checkout_completed_at && <div className="request-modal-choice"><Icon name="cart" size={16} /><span>{fulfillmentLabel(requestDetail.fulfillment_type)} · {paymentBoardLabel(requestDetail, null)}</span></div>}
      <div className="request-files">
        {requestDetail.can_view_prescription === true ? detailFiles.map((file) => file.access_url ? <a className="request-file-card" href={String(file.access_url)} target="_blank" rel="noreferrer" key={String(file.file_id)}><strong>View certificate</strong><span>Open the uploaded prescription</span></a> : null) : <p className="panel-copy">The certificate is not available for this staff role or consent.</p>}
      </div>
      {canAcceptSelected ? <div className="request-decision">
        <div className="request-decision-head"><span className="platform-kicker">YOUR DECISION</span><p className="panel-copy">Enter the total price the patient will pay, then accept. Reject only if you cannot supply this prescription.</p></div>
        <div className="request-accept-amount"><label>Amount the patient pays (DZD)<input type="number" min="1" step="0.01" value={acceptAmount} disabled={acceptingRequest} onChange={(event) => setAcceptAmount(event.target.value)} placeholder="e.g. 1850" /></label><small className="muted">This amount appears on the patient order board.</small></div>
        <div className="request-decision-actions">
          <button className="request-decision-button is-accept" type="button" disabled={acceptingRequest || !acceptAmount.trim()} onClick={acceptSelectedRequest}><Icon name="shield" size={17} /><span><strong>{acceptingRequest ? "Saving..." : "Accept this request"}</strong><small>Send your price to the patient</small></span></button>
          <button className="request-decision-button is-reject" type="button" disabled={acceptingRequest} onClick={() => setShowReject((value) => !value)}><span><strong>Reject</strong><small>Decline with a reason</small></span></button>
        </div>
        {showReject ? <div className="request-reject-box"><label>Reason for rejecting<textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="For example: this medicine is unavailable." rows={3} autoFocus /></label><div className="request-reject-actions"><button className="platform-secondary" type="button" disabled={acceptingRequest} onClick={() => setShowReject(false)}>Cancel</button><button className="request-decision-button is-reject is-confirm" type="button" disabled={acceptingRequest || rejectReason.trim().length < 3} onClick={rejectSelectedRequest}>{acceptingRequest ? "Rejecting..." : "Confirm rejection"}</button></div></div> : null}
      </div> : <div className="request-modal-note"><Icon name="shield" size={16} /><span>{detailRecipientStatus === "ACCEPTED" ? "You already accepted this request." : detailRecipientStatus === "DECLINED" ? "This request was declined." : "This request is no longer awaiting your decision."}</span></div>}
    </>}
  </div>
</div>}</ApiState> : current === "orders" ? <ApiState loading={acceptedRequests.loading || orders.loading} error={acceptedRequests.error || orders.error}><section className="platform-panel"><PageToolbar /><p className="panel-copy">Accepted requests with the chosen fulfillment and payment options. Hand a delivery request to its company or confirm a pickup — the patient sees the change on the delivery page immediately. Online payments stay marked as not charged until they are enabled.</p><DataTable headers={["Request", "Patient", "Fulfillment", "Delivery company", "Payment", "Amount", "Status", "Progress", "Action"]} rows={orderBoardRows} /></section>{fulfillmentError && <div className="form-error" role="alert">{fulfillmentError}</div>}{pendingFulfillment && <div className="order-modal-backdrop" onClick={() => { if (!fulfillmentBusy) setPendingFulfillment(null); }}><div className="order-modal order-action-modal" role="dialog" aria-modal="true" aria-labelledby="order-action-title" onClick={(event) => event.stopPropagation()}><div className="order-modal-header"><div><span className="platform-kicker">UPDATE ORDER</span><h2 id="order-action-title">{pendingFulfillment.label}</h2></div><button className="order-modal-close" type="button" aria-label="Close" onClick={() => { if (!fulfillmentBusy) setPendingFulfillment(null); }}>×</button></div><p className="panel-copy">{pendingFulfillment.detail}</p>{fulfillmentError && <div className="form-error" role="alert">{fulfillmentError}</div>}<div className="order-modal-actions"><button className="platform-secondary" type="button" disabled={fulfillmentBusy} onClick={() => setPendingFulfillment(null)}>Cancel</button><button className="platform-primary" type="button" disabled={fulfillmentBusy} onClick={confirmFulfillment}>{fulfillmentBusy ? "Saving..." : pendingFulfillment.label} <Icon name="arrow" size={15} /></button></div></div></div>}</ApiState> : <ApiState {...state}><section className="platform-panel"><PageToolbar /><DataTable headers={["Reference", "Updated", "Status", "State"]} rows={rowsFor(items, [["reference", "reference"], ["updated_at", "updated_at"], ["status", "status"], ["status", "status"]])} /></section></ApiState>}</PlatformShell>;
}

export function DeliveryPage({ company = false, view = "home" }: { company?: boolean; view?: string }) {
  const current = view as View;
  const companyData = useApi(() => api.deliveryCompany(), [company, current]);
  const drivers = useApi(() => api.deliveryDrivers(), [company, current]);
  const invitations = useApi(() => api.deliveryInvitations(), [company, current]);
  const reports = useApi(() => api.deliveryReports(), [company, current]);
  const jobs = useApi(() => current === "history" ? api.deliveryHistory() : current === "earnings" ? api.deliveryEarnings() : api.deliveryJobs(), [company, current]);
  const state = company ? current === "drivers" ? drivers : current === "invitations" ? invitations : current === "reports" ? reports : companyData : jobs;
  const items = records(state.value);
  const title = company ? current === "drivers" ? "Drivers" : current === "invitations" ? "Invitations" : current === "reports" ? "Reports" : "Delivery console" : current === "jobs" ? "Active jobs" : current === "history" ? "Delivery history" : current === "earnings" ? "Earnings" : "Job board";
  return <PlatformShell role={company ? "company" : "driver"} title={title}><div className="welcome-strip"><div><span className="platform-kicker">{company ? "DELIVERY COMPANY" : "DRIVER SPACE"}</span><h2>{title}</h2><p>Live delivery operations from the DEWA API.</p></div><StatusBadge tone="success">Connected</StatusBadge></div><ApiState {...state}><section className="platform-panel"><PageToolbar /><DataTable headers={["Reference", "Area", "Updated", "Status"]} rows={rowsFor(items, [["reference", "reference"], ["area", "area"], ["updated_at", "updated_at"], ["status", "status"]])} /></section></ApiState></PlatformShell>;
}

export function AdminPage({ view = "home" }: { view?: string }) {
  const current = view as View;
  const analytics = useApi(() => api.adminAnalytics(), [current]);
  const users = useApi(() => api.adminUsers(), [current]);
  const orders = useApi(() => api.adminOrders(), [current]);
  const verification = useApi(() => api.verificationQueue("pharmacies"), [current]);
  const state = current === "users" ? users : current === "orders" ? orders : current === "verification" ? verification : analytics;
  const data = analytics.value && typeof analytics.value === "object" ? analytics.value as RecordValue : {};
  const items = records(state.value);
  const title = current === "users" ? "Users" : current === "orders" ? "Orders" : current === "verification" ? "Verification" : "Admin analytics";
  return <PlatformShell role="admin" title={title}><div className="welcome-strip"><div><span className="platform-kicker">ADMINISTRATION</span><h2>{title}</h2><p>Live operational data from the DEWA administration API.</p></div><StatusBadge tone="success">Permission checked</StatusBadge></div>{current === "home" ? <ApiState {...analytics}><div className="metrics-grid"><MetricCard label="Requests" value={text(data.requests_total ?? data.total_requests, "0")} detail="All time" /><MetricCard label="Offers" value={text(data.offers_total ?? data.total_offers, "0")} detail="All time" tone="purple" /><MetricCard label="GMV" value={money(data.gmv_centimes)} detail="Reported by DEWA" tone="amber" /></div></ApiState> : <ApiState {...state}><section className="platform-panel"><PageToolbar /><DataTable headers={["Reference", "Created", "Status", "Role"]} rows={rowsFor(items, [["reference", "reference"], ["created_at", "created_at"], ["status", "status"], ["role", "role"]])} /></section></ApiState>}</PlatformShell>;
}

export function WorkspacePage({ role, title, eyebrow, description, actions }: { role: Role; title: string; eyebrow: string; description: string; actions: { label: string; href?: string }[] }) {
  return <PlatformShell role={role} title={title}><div className="welcome-strip"><div><span className="platform-kicker">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div><StatusBadge tone="success">Secure workspace</StatusBadge></div><section className="platform-panel workspace-panel"><div className="panel-title"><div><span className="platform-kicker">AVAILABLE ACTIONS</span><h3>Manage this area</h3></div></div><div className="workspace-actions">{actions.map((action) => action.href ? <Link className="platform-secondary" href={action.href} key={action.label}>{action.label} <Icon name="arrow" size={14} /></Link> : <button className="platform-secondary" key={action.label}>{action.label} <Icon name="arrow" size={14} /></button>)}</div></section></PlatformShell>;
}
