import { WorkspacePage } from "@/components/role-pages";
export default function AdminPayments() { return <WorkspacePage role="admin" title="Payments and settlements" eyebrow="ADMINISTRATION" description="Review reconciliation, refunds and settlement records according to your permissions." actions={[{ label: "Reconciliation" }, { label: "Refund requests" }, { label: "Settlements" }]} />; }
