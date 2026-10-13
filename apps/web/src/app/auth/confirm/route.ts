import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = [
  "signup",
  "email",
  "recovery",
  "invite",
  "email_change",
  "magiclink",
];

/**
 * Email links (confirm address, reset password) land here. Unlike the older code-exchange link, this one
 * works even if she opens the email on a different phone or browser than the one she signed up on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(
    searchParams.get("next"),
    type === "recovery" ? "/reset-password" : "/onboarding",
  );
  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
