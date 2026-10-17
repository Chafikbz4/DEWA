"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { api, clearSession, getSession } from "@/lib/api";

type Icon = "grid" | "file" | "cart" | "store" | "truck" | "users" | "chart" | "shield" | "settings" | "bell" | "arrow" | "plus" | "search" | "logout";

function Icon({ name, size = 18 }: { name: Icon; size?: number }) {
  const paths: Record<Icon, ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
    cart: <><path d="M4 5h2l2 11h10l2-8H7" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>,
    store: <><path d="M4 10v10h16V10M3 10l2-6h14l2 6M8 20v-6h8v6M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /></>,
    truck: <><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="19" r="2" /><circle cx="18" cy="19" r="2" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 1 2-5M18 14a4 4 0 0 1 3 4" /></>,
    chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 3-4 3 2 5-7" /></>,
    shield: <><path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6Z" /><path d="m9 12 2 2 4-4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 15a2 2 0 0 0 .4 2l-1.4 1.4a2 2 0 0 0-2-.4 2 2 0 0 0-1.2 1.6h-2a2 2 0 0 0-1.2-1.6 2 2 0 0 0-2 .4L8.2 17a2 2 0 0 0 .4-2 2 2 0 0 0-1.6-1.2v-2A2 2 0 0 0 8.6 10a2 2 0 0 0-.4-2L9.6 6.6a2 2 0 0 0 2 .4A2 2 0 0 0 12.8 5h2A2 2 0 0 0 16 7a2 2 0 0 0 2-.4L19.4 8a2 2 0 0 0-.4 2 2 2 0 0 0 1.6 1.2v2A2 2 0 0 0 19 15Z" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const roleMenus = {
  patient: [["Overview", "grid", "/patient"], ["Requests", "file", "/patient/requests"], ["Orders", "cart", "/patient/orders"], ["Pharmacies", "store", "/patient/pharmacies"], ["Notifications", "bell", "/patient/notifications"], ["Profile", "users", "/patient/profile"]],
  pharmacy: [["Dashboard", "grid", "/pharmacy"], ["Requests inbox", "file", "/pharmacy/requests"], ["Orders board", "cart", "/pharmacy/orders"], ["Offers", "chart", "/pharmacy/offers"], ["Stock", "store", "/pharmacy/stock"], ["Notifications", "bell", "/pharmacy/notifications"], ["Settings", "settings", "/pharmacy/settings"]],
  driver: [["Job board", "truck", "/delivery"], ["Active jobs", "cart", "/delivery/jobs"], ["History", "file", "/delivery/history"], ["Earnings", "chart", "/delivery/earnings"], ["Notifications", "bell", "/delivery/notifications"], ["Settings", "settings", "/delivery/settings"]],
  company: [["Overview", "grid", "/company"], ["Drivers", "truck", "/company/drivers"], ["Invitations", "users", "/company/invitations"], ["Reports", "chart", "/company/reports"], ["Notifications", "bell", "/company/notifications"], ["Settings", "settings", "/company/settings"]],
  admin: [["Analytics", "grid", "/admin"], ["Users", "users", "/admin/users"], ["Verification", "shield", "/admin/verification"], ["Orders", "cart", "/admin/orders"], ["Complaints", "file", "/admin/complaints"], ["Payments", "chart", "/admin/payments"], ["Security", "shield", "/admin/security"], ["Notifications", "bell", "/admin/notifications"], ["Settings", "settings", "/admin/settings"]],
} as const;

export type Role = keyof typeof roleMenus;

function canAccessRole(role: Role, userRole: string) {
  return role === "patient"
    ? userRole === "PATIENT"
    : role === "pharmacy"
      ? userRole.includes("PHARMACY")
      : role === "driver"
        ? userRole === "DRIVER"
        : role === "company"
          ? userRole.includes("DELIVERY_COMPANY")
          : userRole === "ADMIN" || userRole === "SUPER_ADMIN";
}

export function PlatformShell({ role, title, children }: { role: Role; title: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [apiState, setApiState] = useState<"checking" | "connected" | "offline">("checking");
  const [authState, setAuthState] = useState<"checking" | "authorized" | "denied">("checking");
  const menus = roleMenus[role];
  const settingsHref = role === "patient" ? "/settings" : `/${role === "driver" ? "delivery" : role}/settings`;
  const notificationsHref = role === "patient" ? "/patient/notifications" : `/${role === "driver" ? "delivery" : role}/notifications`;
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const session = getSession();
      const userRole = session?.user?.role.toUpperCase() ?? "";
      if (!session || !canAccessRole(role, userRole)) {
        setAuthState("denied");
        router.replace("/login");
      } else {
        setAuthState("authorized");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [role, router]);
  useEffect(() => {
    if (authState !== "authorized") return;
    const checks: Record<Role, () => Promise<unknown>> = {
      patient: api.me,
      pharmacy: api.pharmacySummary,
      driver: api.activeDeliveryJobs,
      company: api.deliveryCompany,
      admin: api.adminPermissions,
    };
    checks[role]().then(() => setApiState("connected")).catch(() => setApiState("offline"));
  }, [role, authState]);
  if (authState !== "authorized") return <main className="auth-page"><div className="auth-card"><span className="platform-kicker">SECURE ACCESS</span><h1>{authState === "checking" ? "Checking your session..." : "Sign in required"}</h1><p>{authState === "checking" ? "Loading your DEWA workspace." : "Please sign in with an account that has access to this workspace."}</p></div></main>;
  return <main className="platform-shell">
    <aside className="platform-sidebar"><Link className="platform-brand" href="/"><span className="platform-logo">+</span>dewa</Link><p className="platform-menu-label">{role === "admin" ? "BACK-OFFICE" : role.toUpperCase()}</p><nav>{menus.map(([label, icon, href]) => <Link className={pathname === href ? "platform-link active" : "platform-link"} href={href} key={href}><Icon name={icon} />{label}</Link>)}</nav><div className="platform-sidebar-bottom"><Link className={pathname === settingsHref ? "platform-link active" : "platform-link"} href={settingsHref}><Icon name="settings" />Settings</Link><Link className="platform-link" href="/login" onClick={clearSession}><Icon name="logout" />Sign out</Link></div></aside>
    <section className="platform-main"><header className="platform-header"><div><span className="platform-kicker">DEWA PLATFORM</span><h1>{title}</h1></div><div className="platform-header-actions"><span className={`api-connection ${apiState}`}><i />{apiState === "checking" ? "Connecting..." : apiState === "connected" ? "API connected" : "Demo mode"}</span><Link className="platform-icon-button" href={notificationsHref} aria-label="Notifications"><Icon name="bell" /></Link><span className="platform-avatar">{role === "admin" ? "SA" : role === "patient" ? "AB" : "DW"}</span></div></header><div className="platform-body">{children}</div></section>
  </main>;
}

export function MetricCard({ label, value, detail, tone = "teal" }: { label: string; value: string; detail: string; tone?: string }) {
  return <article className="metric-card"><span className={`metric-dot ${tone}`} /><div><span className="metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

export function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return <div className="data-table-wrap"><table className="data-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

export function PageToolbar({ search = true, action }: { search?: boolean; action?: ReactNode }) {
  return <div className="page-toolbar">{search && <label className="table-search"><Icon name="search" size={16} /><input placeholder="Search..." /></label>}<div className="toolbar-spacer" />{action}</div>;
}

export { Icon };
