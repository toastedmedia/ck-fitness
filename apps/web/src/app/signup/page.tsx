import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { SignupForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Create your account" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  return (
    <AuthShell title="Create your account" intro="Free to start. No card needed.">
      <SignupForm refCode={/^[a-zA-Z0-9]{6,12}$/.test(ref ?? "") ? ref : undefined} />
    </AuthShell>
  );
}
