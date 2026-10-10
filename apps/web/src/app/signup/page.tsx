import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { SignupForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Create your account" };

export default function Page() {
  return (
    <AuthShell title="Create your account" intro="Free to start. No card needed.">
      <SignupForm />
    </AuthShell>
  );
}
