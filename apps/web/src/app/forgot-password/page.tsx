import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { ForgotForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Reset your password" };

export default function Page() {
  return (
    <AuthShell
      title="Reset your password"
      intro="Enter your email and we will send you a link."
    >
      <ForgotForm />
    </AuthShell>
  );
}
