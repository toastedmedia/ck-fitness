import "server-only";
import {
  DEFAULT_NUDGE_SMS,
  countryAllowed,
  maskPhone,
  nudgeTextDue,
  quietDays,
  renderSms,
  toE164,
  dayKey,
} from "@ck/core";
import { loadFollowUpMembers } from "@/lib/followup";
import { openSecret } from "@/lib/secret-box";
import { createAdminSupabase } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminSupabase>;

export type SmsSettingsRow = {
  enabled: boolean;
  account_sid: string | null;
  auth_token_enc: string | null;
  auth_token_hint: string | null;
  from_number: string | null;
  messaging_service_sid: string | null;
  welcome_body: string;
  allowed_country_codes: string[];
  daily_limit: number;
  updated_at: string | null;
  /** Missed-workout text (SQL 0032). Defaults until it is run. */
  nudge_enabled: boolean;
  nudge_body: string;
  nudge_after_days: number;
  nudge_every_days: number;
  /** False until SQL 0032 adds the missed-workout columns. */
  nudge_ready: boolean;
};

const COLUMNS =
  "enabled,account_sid,auth_token_enc,auth_token_hint,from_number,messaging_service_sid,welcome_body,allowed_country_codes,daily_limit,updated_at";
const NUDGE_COLUMNS = "nudge_enabled,nudge_body,nudge_after_days,nudge_every_days";
const NUDGE_DEFAULTS = {
  nudge_enabled: false,
  nudge_body: DEFAULT_NUDGE_SMS,
  nudge_after_days: 3,
  nudge_every_days: 7,
};

/** The saved Twilio setup, or `missing` when SQL 0031 has not been run yet. Server only. */
export async function loadSmsSettings(
  db: Db = createAdminSupabase(),
): Promise<{ row: SmsSettingsRow | null; missing: boolean }> {
  const full = await db
    .from("sms_settings")
    .select(`${COLUMNS},${NUDGE_COLUMNS}`)
    .eq("id", 1)
    .maybeSingle();
  if (!full.error)
    return {
      row: full.data
        ? ({ ...(full.data as object), nudge_ready: true } as SmsSettingsRow)
        : null,
      missing: false,
    };
  // Before SQL 0032 the missed-workout columns do not exist yet; welcome texts keep working.
  const { data, error } = await db
    .from("sms_settings")
    .select(COLUMNS)
    .eq("id", 1)
    .maybeSingle();
  if (error) return { row: null, missing: true };
  return {
    row: data
      ? ({ ...(data as object), ...NUDGE_DEFAULTS, nudge_ready: false } as SmsSettingsRow)
      : null,
    missing: false,
  };
}

type Ready = {
  accountSid: string;
  token: string;
  from: string | null;
  mg: string | null;
};

/** The keys needed to send, or why sending is not possible. */
export function readyToSend(row: SmsSettingsRow | null): Ready | { problem: string } {
  if (!row?.account_sid) return { problem: "Add the Account SID." };
  const token = openSecret(row.auth_token_enc);
  if (!token)
    return {
      problem: row.auth_token_enc
        ? "The saved Auth Token cannot be read any more (the server key changed). Type it again."
        : "Add the Auth Token.",
    };
  if (!row.from_number && !row.messaging_service_sid)
    return { problem: "Add a Twilio phone number or Messaging Service SID." };
  return {
    accountSid: row.account_sid,
    token,
    from: row.from_number,
    mg: row.messaging_service_sid,
  };
}

/** Sends one text through Twilio's Messages API. Never throws. */
export async function twilioSend(
  cfg: Ready,
  to: string,
  body: string,
): Promise<{ ok: true; sid: string } | { ok: false; error: string }> {
  const form = new URLSearchParams({ To: to, Body: body });
  if (cfg.mg) form.set("MessagingServiceSid", cfg.mg);
  else if (cfg.from) form.set("From", cfg.from);
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.token}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
      code?: number;
    };
    if (res.ok && json.sid) return { ok: true, sid: json.sid };
    const why =
      res.status === 401
        ? "Twilio refused the Account SID or Auth Token."
        : (json.message ?? `Twilio answered ${res.status}.`);
    return {
      ok: false,
      error: `${why}${json.code ? ` (code ${json.code})` : ""}`.slice(0, 300),
    };
  } catch {
    return { ok: false, error: "Could not reach Twilio. Please try again." };
  }
}

/** Texts sent in the last 24 hours (the daily safety limit). */
async function sentLastDay(db: Db): Promise<number> {
  const { count } = await db
    .from("sms_messages")
    .select("id", { count: "exact", head: true })
    .in("status", ["sending", "sent"])
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  return count ?? 0;
}

/**
 * The welcome text, once per member, after she finishes signing up (email confirmed, questionnaire
 * done), so it only reaches real people. Skipped quietly when texts are off, the setup is
 * incomplete, the number cannot be read, the country is not allowed or the daily limit is reached.
 * Never throws: a text must never break sign-up.
 */
export async function sendWelcomeText(userId: string): Promise<void> {
  try {
    const db = createAdminSupabase();
    const { row } = await loadSmsSettings(db);
    if (!row?.enabled) return;
    const cfg = readyToSend(row);
    if ("problem" in cfg) return;
    const { data: p } = await db
      .from("profiles")
      .select("first_name,phone")
      .eq("user_id", userId)
      .maybeSingle();
    const to = toE164((p as { phone?: string | null } | null)?.phone);
    if (!to || !countryAllowed(to, row.allowed_country_codes)) return;
    if ((await sentLastDay(db)) >= row.daily_limit) return;
    // Claim the one welcome slot first; a second attempt hits the unique index and stops here.
    const { data: claim, error } = await db
      .from("sms_messages")
      .insert({
        user_id: userId,
        kind: "welcome",
        to_masked: maskPhone(to),
        status: "sending",
      })
      .select("id")
      .single();
    if (error || !claim) return;
    const body = renderSms(row.welcome_body, {
      firstName: (p as { first_name?: string | null } | null)?.first_name,
    });
    const r = await twilioSend(cfg, to, body);
    await db
      .from("sms_messages")
      .update(
        r.ok
          ? { status: "sent", provider_sid: r.sid }
          : { status: "failed", error: r.error },
      )
      .eq("id", (claim as { id: string }).id);
  } catch (e) {
    console.error("welcome text failed", e);
  }
}

/** A test text from Admin to the owner's own phone. Uses the saved setup. */
export async function sendTestText(
  rawTo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = createAdminSupabase();
  const { row, missing } = await loadSmsSettings(db);
  if (missing) return { ok: false, error: "Run SQL 0031 in Supabase first." };
  const cfg = readyToSend(row);
  if ("problem" in cfg) return { ok: false, error: cfg.problem };
  const to = toE164(rawTo);
  if (!to)
    return {
      ok: false,
      error: "Write the phone number with its country code, e.g. +16045550123.",
    };
  const body = renderSms(row!.welcome_body, { firstName: "Test" });
  const r = await twilioSend(cfg, to, body);
  await db.from("sms_messages").insert({
    kind: "test",
    to_masked: maskPhone(to),
    status: r.ok ? "sent" : "failed",
    provider_sid: r.ok ? r.sid : null,
    error: r.ok ? null : r.error,
  });
  return r.ok ? { ok: true } : r;
}

/**
 * Daily: the missed-workout text. Only for members who turned ON "Text message" in Profile (their
 * consent), with a number we can text in an allowed country, after the chosen days without a
 * workout, at most once every `nudge_every_days`, within the shared daily limit. Never throws.
 */
export async function sendMissedWorkoutTexts(
  db: Db = createAdminSupabase(),
  now = new Date(),
): Promise<{ sent: number; failed: number; skipped?: string }> {
  try {
    const { row } = await loadSmsSettings(db);
    if (!row?.nudge_ready) return { sent: 0, failed: 0, skipped: "SQL 0032 not run" };
    if (!row.nudge_enabled) return { sent: 0, failed: 0, skipped: "off" };
    const cfg = readyToSend(row);
    if ("problem" in cfg) return { sent: 0, failed: 0, skipped: cfg.problem };
    const today = dayKey(now);
    const [{ members }, prefs, last] = await Promise.all([
      loadFollowUpMembers(db, today),
      db.from("notification_preferences").select("user_id").eq("sms", true),
      db
        .from("sms_messages")
        .select("user_id,created_at")
        .eq("kind", "nudge") // failed ones count too: a bad number is not retried every day
        .order("created_at", { ascending: false })
        .limit(5000),
    ]);
    const optedIn = new Set(
      ((prefs.data ?? []) as { user_id: string }[]).map((p) => p.user_id),
    );
    const lastNudge = new Map<string, string>();
    for (const r of (last.data ?? []) as { user_id: string; created_at: string }[])
      if (!lastNudge.has(r.user_id)) lastNudge.set(r.user_id, r.created_at);
    let room = row.daily_limit - (await sentLastDay(db));
    let sent = 0;
    let failed = 0;
    for (const m of members) {
      if (room <= 0) break;
      const to = toE164(m.phone);
      const textable = Boolean(to && countryAllowed(to, row.allowed_country_codes));
      if (
        !nudgeTextDue({
          optedIn: optedIn.has(m.userId),
          textable,
          quietDays: quietDays(m, today),
          afterDays: row.nudge_after_days,
          lastNudgeAt: lastNudge.get(m.userId) ?? null,
          everyDays: row.nudge_every_days,
          now: now.getTime(),
        })
      )
        continue;
      const { data: claim, error } = await db
        .from("sms_messages")
        .insert({
          user_id: m.userId,
          kind: "nudge",
          to_masked: maskPhone(to!),
          status: "sending",
        })
        .select("id")
        .single();
      if (error || !claim) continue;
      room--;
      const r = await twilioSend(
        cfg,
        to!,
        renderSms(row.nudge_body, { firstName: m.name === "Member" ? null : m.name }),
      );
      await db
        .from("sms_messages")
        .update(
          r.ok
            ? { status: "sent", provider_sid: r.sid }
            : { status: "failed", error: r.error },
        )
        .eq("id", (claim as { id: string }).id);
      if (r.ok) sent++;
      else failed++;
    }
    return { sent, failed };
  } catch (e) {
    console.error("missed-workout texts failed", e);
    return { sent: 0, failed: 0, skipped: "error" };
  }
}
