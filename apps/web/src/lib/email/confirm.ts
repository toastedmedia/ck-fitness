import "server-only";
import type { createAdminSupabase } from "@/lib/supabase/admin";

/** Sends Supabase's own (branded) sign-up confirmation email again. */
export async function resendConfirmationEmail(
  db: ReturnType<typeof createAdminSupabase>,
  email: string,
): Promise<boolean> {
  const site = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.chardikalafitness.com"
  ).replace(/\/$/, "");
  const { error } = await db.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${site}/auth/callback?next=/onboarding` },
  });
  if (error) console.error("resend confirmation failed", error.message);
  return !error;
}
