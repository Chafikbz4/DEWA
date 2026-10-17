import { WorkspacePage } from "@/components/role-pages";
export default function DriverSettings() { return <WorkspacePage role="driver" title="Driver settings" eyebrow="DRIVER SPACE" description="Manage availability, documents and your delivery profile." actions={[{ label: "Go online / offline" }, { label: "Upload documents" }, { label: "Profile" }]} />; }
