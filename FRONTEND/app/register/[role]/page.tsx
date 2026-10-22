import RegisterForm from "@/components/register-form";

export function generateStaticParams() {
  return [{ role: "patient" }, { role: "pharmacist" }, { role: "driver" }, { role: "company" }];
}

export default async function RegisterPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  return <RegisterForm role={role} />;
}
