"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DataTable, Icon, MetricCard, PageToolbar, PlatformShell, Role, StatusBadge } from "./platform";

type RecordValue = Record<string, unknown>;
type View = "home" | "requests" | "orders" | "pharmacies" | "stock" | "jobs" | "history" | "earnings" | "drivers" | "invitations" | "reports" | "verification" | "users" | "complaints";

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
  const requests = useApi(() => api.requests(), [current]);
  const orders = useApi(() => api.orders(), [current]);
  const pharmacies = useApi(() => api.pharmaciesNearby(), [current]);
  const title = current === "requests" ? "My requests" : current === "orders" ? "My orders" : current === "pharmacies" ? "Find a pharmacy" : "Your care, in one place";
  const requestItems = records(requests.value);
  const orderItems = records(orders.value);
  const pharmacyItems = records(pharmacies.value);
  return <PlatformShell role="patient" title={title}><div className="welcome-strip"><div><span className="platform-kicker">PATIENT SPACE</span><h2>{title}</h2><p>Live information from your DEWA account.</p></div><Link href="/patient/requests/new" className="platform-primary"><Icon name="plus" size={16} /> New request</Link></div>
    {current === "home" && <><div className="metrics-grid"><MetricCard label="Active requests" value={String(requestItems.filter((item) => !["COMPLETED", "CANCELLED"].includes(String(item.status))).length)} detail="From your account" /><MetricCard label="Orders" value={String(orderItems.length)} detail="Loaded from DEWA" tone="purple" /><MetricCard label="Nearby pharmacies" value={String(pharmacyItems.length)} detail="Available around you" tone="amber" /></div><section className="platform-panel"><div className="panel-title"><div><span className="platform-kicker">RECENT REQUESTS</span><h3>Your latest activity</h3></div><Link href="/patient/requests" className="panel-link">View all <Icon name="arrow" size={15} /></Link></div><ApiState {...requests}><DataTable headers={["Reference", "Created", "Offers", "Status"]} rows={rowsFor(requestItems.slice(0, 5), [["reference", "reference"], ["created_at", "created_at"], ["offers_count", "offers_count"], ["status", "status"]])} /></ApiState></section></>}
    {current === "requests" && <ApiState {...requests}><section className="platform-panel"><PageToolbar action={<Link href="/patient/requests/new" className="platform-secondary"><Icon name="plus" size={15} /> New request</Link>} /><DataTable headers={["Reference", "Created", "Offers", "Status"]} rows={rowsFor(requestItems, [["reference", "reference"], ["created_at", "created_at"], ["offers_count", "offers_count"], ["status", "status"]])} /></section></ApiState>}
    {current === "orders" && <ApiState {...orders}><section className="platform-panel"><PageToolbar /><DataTable headers={["Order", "Created", "Total", "Status"]} rows={orderItems.map((item) => [<strong key="id">{text(item.reference ?? item.id)}</strong>, <span className="muted" key="date">{date(item.created_at)}</span>, <span className="muted" key="total">{money(item.total_centimes)}</span>, statusCell(item.status)])} /></section></ApiState>}
    {current === "pharmacies" && <ApiState {...pharmacies}><section className="platform-panel"><PageToolbar /><DataTable headers={["Pharmacy", "Area", "Distance", "Availability"]} rows={pharmacyItems.map((item) => [<strong key="name">{text(item.name_fr ?? item.name)}</strong>, <span className="muted" key="area">{text(item.commune_name ?? item.address)}</span>, <span className="muted" key="distance">{item.distance_m === undefined ? "—" : `${(Number(item.distance_m) / 1000).toFixed(1)} km`}</span>, statusCell(item.open_now ? "OPEN" : "CLOSED")])} /></section></ApiState>}
  </PlatformShell>;
}

export function NewRequestPage() {
  return <PlatformShell role="patient" title="New prescription request"><section className="platform-panel request-form"><span className="platform-kicker">REQUEST</span><h2>Prescription submission</h2><p className="panel-copy">Upload and submit a prescription through the DEWA request workflow.</p><label className="upload-zone"><Icon name="file" size={28} /><strong>Choose your prescription</strong><span>JPG, PNG or PDF · up to 10 MB per page</span><input type="file" accept="image/*,.pdf" /></label><label className="check-row"><input type="checkbox" defaultChecked /> I consent to share this prescription with matched pharmacies.</label><div className="form-actions"><Link href="/patient" className="platform-secondary">Cancel</Link><button className="platform-primary" disabled>Complete the request in your account</button></div></section></PlatformShell>;
}

export function PharmacyPage({ view = "home" }: { view?: string }) {
  const current = view as View;
  const summary = useApi(() => api.pharmacySummary(), [current]);
  const requests = useApi(() => api.pharmacyRequests(), [current]);
  const orders = useApi(() => api.pharmacyOrders(), [current]);
  const stock = useApi(() => api.pharmacyStock(), [current]);
  const data = summary.value && typeof summary.value === "object" ? summary.value as RecordValue : {};
  const items = current === "requests" ? records(requests.value) : current === "orders" ? records(orders.value) : records(stock.value);
  const title = current === "requests" ? "Request inbox" : current === "orders" ? "Orders board" : current === "stock" ? "Stock management" : "Pharmacy dashboard";
  const state = current === "requests" ? requests : current === "orders" ? orders : current === "stock" ? stock : summary;
  return <PlatformShell role="pharmacy" title={title}><div className="welcome-strip"><div><span className="platform-kicker">PHARMACY SPACE</span><h2>{title}</h2><p>Live operational data from your pharmacy account.</p></div><StatusBadge tone={tone(data.status)}> {text(data.status, "Connected")} </StatusBadge></div>{current === "home" ? <ApiState {...summary}><><div className="metrics-grid"><MetricCard label="Requests received" value={text(data.requests_received, "0")} detail="Current reporting period" /><MetricCard label="Offers sent" value={text(data.offers_sent, "0")} detail={`Accepted: ${text(data.offers_accepted, "0")}`} tone="purple" /><MetricCard label="Revenue" value={money(data.revenue_centimes)} detail="Reported by DEWA" tone="amber" /></div><section className="platform-panel"><div className="panel-title"><h3>Requests needing attention</h3><Link href="/pharmacy/requests" className="panel-link">View inbox <Icon name="arrow" size={15} /></Link></div><ApiState {...requests}><DataTable headers={["Request", "Sent", "Urgency", "Status"]} rows={rowsFor(records(requests.value).slice(0, 5), [["reference", "reference"], ["sent_at", "sent_at"], ["urgency", "urgency"], ["status", "status"]])} /></ApiState></section></></ApiState> : <ApiState {...state}><section className="platform-panel"><PageToolbar /><DataTable headers={["Reference", "Updated", "Status", "State"]} rows={rowsFor(items, [["reference", "reference"], ["updated_at", "updated_at"], ["status", "status"], ["status", "status"]])} /></section></ApiState>}</PlatformShell>;
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
