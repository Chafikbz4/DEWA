import { WorkspacePage } from "@/components/role-pages";
export default function PharmacyOffers() { return <WorkspacePage role="pharmacy" title="Offers" eyebrow="PHARMACY SPACE" description="Draft, send and manage offers while the server calculates totals and delivery fees." actions={[{ label: "Create offer", href: "/pharmacy/requests" }, { label: "View sent offers" }]} />; }
