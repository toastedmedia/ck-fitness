import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { SignupForm } from "@/components/AuthForms";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Create your account" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  const refCode = /^[a-zA-Z0-9]{6,12}$/.test(ref ?? "") ? ref : undefined;
  // First name only, so a shared link never reveals more than the friend's first name.
  let inviter: string | null = null;
  if (refCode) {
    try {
      const { data } = await createAdminSupabase()
        .from("profiles")
        .select("first_name")
        .eq("referral_code", refCode.toLowerCase())
        .maybeSingle();
      inviter = data?.first_name?.trim() || null;
    } catch {
      inviter = null;
    }
  }
  return (
    <AuthShell title="Create your account" intro="Free to start. No card needed.">
      {inviter ? (
        <p className="mt-4 rounded-2xl bg-success-soft p-3 font-semibold text-success">
          {inviter} is inviting you to join the Chardikala Fitness App.
        </p>
      ) : null}
      <SignupForm refCode={refCode} />
    </AuthShell>
  );
}
