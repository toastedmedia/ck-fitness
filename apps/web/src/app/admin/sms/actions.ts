"use server";

import { redirect } from "next/navigation";
import { validateSmsSettings } from "@ck/core";
import { OPS, audit, requireStaff } from "@/lib/admin";
import { sealSecret } from "@/lib/secret-box";
import { loadSmsSettings, sendTestText } from "@/lib/sms";

const val = (f: FormData, k: string, max = 600) => String(f.get(k) ?? "").slice(0, max);
const back = (q: string) => redirect(`/admin/sms?${q}`);

/** Saves the Twilio keys and switches. Owners and admins only. The Auth Token is stored encrypted. */
export async function saveSmsSettings(formData: FormData): Promise<void> {
  const { supabase, user, db } = await requireStaff(OPS);
  const { row, missing } = await loadSmsSettings(db);
  if (missing) back("error=" + encodeURIComponent("Run SQL 0031 in Supabase first."));
  const r = validateSmsSettings({
    accountSid: val(formData, "account_sid", 80),
    authToken: val(formData, "auth_token", 80),
    hasSavedToken: Boolean(row?.auth_token_enc),
    fromNumber: val(formData, "from_number", 40),
    messagingServiceSid: val(formData, "messaging_service_sid", 80),
    welcomeBody: val(formData, "welcome_body", 600),
    countryCodes: val(formData, "country_codes", 80),
    dailyLimit: val(formData, "daily_limit", 8),
    enabled: formData.get("enabled") === "on",
    nudgeEnabled: formData.get("nudge_enabled") === "on",
    nudgeBody: val(formData, "nudge_body", 600) || undefined,
    nudgeAfterDays: val(formData, "nudge_after_days", 4) || undefined,
    nudgeEveryDays: val(formData, "nudge_every_days", 4) || undefined,
  });
  if (!r.ok) return back("error=" + encodeURIComponent(r.error));
  const v = r.value;
  const { error } = await db.from("sms_settings").upsert({
    id: 1,
    enabled: v.enabled,
    account_sid: v.accountSid,
    ...(v.authToken
      ? {
          auth_token_enc: sealSecret(v.authToken),
          auth_token_hint: v.authToken.slice(-4),
        }
      : {}),
    from_number: v.fromNumber,
    messaging_service_sid: v.messagingServiceSid,
    welcome_body: v.welcomeBody,
    allowed_country_codes: v.countryCodes,
    daily_limit: v.dailyLimit,
    // The missed-workout columns exist only after SQL 0032.
    ...(row?.nudge_ready
      ? {
          nudge_enabled: v.nudgeEnabled,
          nudge_body: v.nudgeBody,
          nudge_after_days: v.nudgeAfterDays,
          nudge_every_days: v.nudgeEveryDays,
        }
      : {}),
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  });
  if (error)
    return back("error=" + encodeURIComponent("That did not save. Please try again."));
  // Never the keys themselves.
  await audit(supabase, user.id, "sms.settings", "sms_settings", {
    enabled: v.enabled,
    missed_workout_texts: v.nudgeEnabled,
    token_changed: Boolean(v.authToken),
    countries: v.countryCodes,
    daily_limit: v.dailyLimit,
  });
  back("saved=1");
}

/** Sends the welcome text to a number the owner types, using the saved setup. */
export async function sendSmsTest(formData: FormData): Promise<void> {
  const { supabase, user } = await requireStaff(OPS);
  const r = await sendTestText(val(formData, "test_to", 40));
  await audit(supabase, user.id, "sms.test", "sms_settings", { ok: r.ok });
  if (!r.ok) return back("error=" + encodeURIComponent(r.error));
  back("tested=1");
}
