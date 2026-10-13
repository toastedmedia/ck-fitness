"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth";
import { queueCrm, track } from "@/lib/events";
import { createServerSupabase } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  message?: string;
}

const MIN_PASSWORD = 8;
/** Bump this whenever the Terms or Privacy Policy change in a way members must re-accept. */
const TERMS_VERSION = "2026-10-draft";
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

async function siteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

function read(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const { email, password } = read(formData);
  if (!emailOk(email)) return { error: "Please enter a valid email address." };
  if (password.length < MIN_PASSWORD)
    return { error: `Your password needs at least ${MIN_PASSWORD} characters.` };
  const first = String(formData.get("first_name") ?? "")
    .trim()
    .slice(0, 60);
  const last = String(formData.get("last_name") ?? "")
    .trim()
    .slice(0, 60);
  const phone = String(formData.get("phone") ?? "")
    .trim()
    .slice(0, 30);
  if (!first || !last) return { error: "Please enter your first and last name." };
  if (!/^\+?[0-9 ()-]{7,20}$/.test(phone))
    return { error: "Please enter a valid phone number." };
  if (formData.get("adult") !== "on")
    return { error: "Please confirm you are 18 or older to continue." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await siteUrl()}/auth/callback?next=/onboarding`,
      // Recorded on her profile: when she accepted, and which version of the terms.
      data: {
        terms_accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
        first_name: first,
        last_name: last,
        phone,
      },
    },
  });
  if (error) return { error: "We could not create your account. Please try again." };
  if (data.user && (data.user.identities?.length ?? 0) > 0) {
    await queueCrm(data.user.id, "free_account_created");
    await track(data.user.id, "signup");
  }
  if (data.session) redirect("/onboarding");
  return { message: "Check your email. We sent you a link to confirm your address." };
}

export async function logIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const { email, password } = read(formData);
  if (!emailOk(email) || !password)
    return { error: "Please enter your email and password." };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password do not match. Please try again." };
  // Go back to where she was heading (for example /admin), otherwise Home.
  redirect(safeNext(String(formData.get("next") ?? ""), "/home"));
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { email } = read(formData);
  if (!emailOk(email)) return { error: "Please enter a valid email address." };
  const supabase = await createServerSupabase();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteUrl()}/auth/callback?next=/reset-password`,
  });
  // Same answer whether or not the account exists.
  return { message: "If that email has an account, a reset link is on its way." };
}

export async function updatePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { password } = read(formData);
  if (password.length < MIN_PASSWORD)
    return { error: `Your password needs at least ${MIN_PASSWORD} characters.` };
  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password });
  if (error)
    return {
      error: "We could not update your password. Please open the reset link again.",
    };
  redirect("/home");
}
