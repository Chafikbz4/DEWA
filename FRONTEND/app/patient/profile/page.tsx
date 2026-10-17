import { WorkspacePage } from "@/components/role-pages";
export default function PatientProfile() { return <WorkspacePage role="patient" title="Profile" eyebrow="PATIENT SPACE" description="Manage your identity, addresses, dependants and privacy preferences." actions={[{ label: "Edit profile" }, { label: "Manage addresses" }, { label: "Privacy and data", href: "/settings" }]} />; }
