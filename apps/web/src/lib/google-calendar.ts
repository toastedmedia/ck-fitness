import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { TimeRange } from "@ck/core";
import { openSecret, sealSecret } from "@/lib/secret-box";
import type { createAdminSupabase } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminSupabase>;

/**
 * Two-way Google Calendar sync for consultations (one coach calendar, e.g. Chanveer's Gmail):
 * busy times in Google block the booking page, and every booking is added to / moved in / removed
 * from that calendar. Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (Google Cloud -> OAuth client,
 * redirect https://app.chardikalafitness.com/api/google/callback). The refresh token is stored
 * encrypted. Every call is best-effort: Google being down never blocks a booking.
 */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

const APP = () =>
  (process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.chardikalafitness.com").replace(
    /\/$/,
    "",
  );
export const googleRedirectUri = () => `${APP()}/api/google/callback`;
export const googleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/* ---------------------------------------------------------- OAuth */

const stateKey = () =>
  createHmac("sha256", process.env.CRON_SECRET ?? "dev")
    .update("google-state")
    .digest();
export function newState(userId: string): string {
  const raw = `${userId}.${Date.now()}.${randomBytes(8).toString("hex")}`;
  return `${raw}.${createHmac("sha256", stateKey()).update(raw).digest("base64url")}`;
}
export function checkState(state: string, userId: string): boolean {
  const i = state.lastIndexOf(".");
  if (i < 0) return false;
  const raw = state.slice(0, i);
  const a = Buffer.from(state.slice(i + 1));
  const b = Buffer.from(createHmac("sha256", stateKey()).update(raw).digest("base64url"));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const [uid, at] = raw.split(".");
  return uid === userId && Date.now() - Number(at) < 15 * 60000;
}

export function googleAuthUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Swaps the code from Google's consent screen for a long-lived refresh token and saves it. */
export async function connectGoogle(
  db: Db,
  code: string,
  userId: string,
): Promise<{ ok: boolean; email?: string; error?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const j = (await res.json().catch(() => ({}))) as {
    refresh_token?: string;
    access_token?: string;
    id_token?: string;
    scope?: string;
    error_description?: string;
  };
  if (!res.ok || !j.refresh_token)
    return { ok: false, error: j.error_description ?? "Google did not give access." };
  if (!(j.scope ?? "").includes("calendar.events"))
    return {
      ok: false,
      error: "Please tick the calendar permission on Google's screen.",
    };
  let email = "";
  try {
    email =
      JSON.parse(
        Buffer.from((j.id_token ?? "").split(".")[1] ?? "", "base64url").toString(),
      ).email ?? "";
  } catch {
    /* no email: fine */
  }
  const { error } = await db.from("google_calendar_link").upsert({
    id: 1,
    email,
    refresh_token: sealSecret(j.refresh_token),
    calendar_id: "primary",
    connected_by: userId,
    connected_at: new Date().toISOString(),
    last_error: null,
    last_ok_at: new Date().toISOString(),
  });
  cache = null;
  return error
    ? { ok: false, error: "Could not save. Run the latest database update (0037)." }
    : { ok: true, email };
}

export async function disconnectGoogle(db: Db) {
  const link = await readLink(db);
  const token = link ? openSecret(link.refresh_token) : null;
  if (token)
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      { method: "POST" },
    ).catch(() => {});
  await db.from("google_calendar_link").delete().eq("id", 1);
  cache = null;
}

/* ---------------------------------------------------------- tokens */

export interface GoogleLink {
  email: string;
  refresh_token: string;
  calendar_id: string;
  block_busy: boolean;
  last_error: string | null;
  last_ok_at: string | null;
  connected_at: string;
}
export async function readLink(db: Db): Promise<GoogleLink | null> {
  const { data, error } = await db
    .from("google_calendar_link")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return error ? null : ((data as GoogleLink | null) ?? null);
}

let cache: { token: string; until: number } | null = null;
async function note(db: Db, err: string | null) {
  await db
    .from("google_calendar_link")
    .update(
      err
        ? { last_error: err.slice(0, 300) }
        : { last_error: null, last_ok_at: new Date().toISOString() },
    )
    .eq("id", 1);
}

async function accessToken(db: Db, link: GoogleLink): Promise<string | null> {
  if (cache && cache.until > Date.now()) return cache.token;
  const refresh = openSecret(link.refresh_token);
  if (!refresh || !googleConfigured()) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refresh,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }),
  });
  const j = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !j.access_token) {
    await note(
      db,
      j.error === "invalid_grant"
        ? "Google access was removed or expired. Connect Google Calendar again."
        : `Google token error ${res.status}`,
    );
    return null;
  }
  cache = {
    token: j.access_token,
    until: Date.now() + Math.max(60, (j.expires_in ?? 3600) - 120) * 1000,
  };
  return cache.token;
}

async function api(db: Db, link: GoogleLink, path: string, init: RequestInit = {}) {
  const token = await accessToken(db, link);
  if (!token) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...init,
      signal: ctl.signal,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      await note(
        db,
        `Google Calendar ${res.status}: ${(await res.text()).slice(0, 150)}`,
      );
      return null;
    }
    return res;
  } catch (e) {
    await note(db, `Google Calendar: ${(e as Error).message}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/* ---------------------------------------------------------- busy times */

let busyCache: { key: string; at: number; ranges: TimeRange[] } | null = null;

/** Busy times in the connected calendar (cached for 1 minute). Empty when not connected or off. */
export async function googleBusy(db: Db, from: Date, to: Date): Promise<TimeRange[]> {
  if (!googleConfigured()) return [];
  const key = `${from.toISOString().slice(0, 13)}|${to.toISOString().slice(0, 10)}`;
  if (busyCache && busyCache.key === key && Date.now() - busyCache.at < 60000)
    return busyCache.ranges;
  const link = await readLink(db);
  if (!link || !link.block_busy) return [];
  const res = await api(db, link, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      items: [{ id: link.calendar_id }],
    }),
  });
  if (!res?.ok) return busyCache?.ranges ?? [];
  const j = (await res.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
  };
  const ranges = (j.calendars?.[link.calendar_id]?.busy ?? []).map((b) => ({
    starts_at: b.start,
    ends_at: b.end,
  }));
  busyCache = { key, at: Date.now(), ranges };
  await note(db, null);
  return ranges;
}

/* ---------------------------------------------------------- events */

export interface EventBooking {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  goal: string;
  contact_id: string | null;
  google_event_id?: string | null;
}

/** Adds or updates the booking in the connected Google Calendar. Saves the event id. Never throws. */
export async function syncBookingEvent(db: Db, b: EventBooking): Promise<void> {
  try {
    if (!googleConfigured()) return;
    const link = await readLink(db);
    if (!link) return;
    const cal = encodeURIComponent(link.calendar_id);
    if (b.status === "cancelled") {
      if (b.google_event_id)
        await api(
          db,
          link,
          `/calendars/${cal}/events/${encodeURIComponent(b.google_event_id)}`,
          { method: "DELETE" },
        );
      return;
    }
    const name = `${b.first_name} ${b.last_name}`.trim() || b.email;
    const prefix =
      b.status === "no_show" ? "(No-show) " : b.status === "completed" ? "(Done) " : "";
    const body = {
      summary: `${prefix}Consult: ${name}`,
      description: `Free consultation (chardikalafitness.com)\nPhone: ${b.phone || "-"}\nEmail: ${b.email}\nGoal: ${b.goal || "-"}\n\n${APP()}/admin/${b.contact_id ? `leads/${b.contact_id}` : "calendar"}`,
      start: { dateTime: b.starts_at },
      end: { dateTime: b.ends_at },
      reminders: { useDefault: true },
      extendedProperties: { private: { ckBooking: b.id } },
    };
    if (b.google_event_id) {
      const res = await api(
        db,
        link,
        `/calendars/${cal}/events/${encodeURIComponent(b.google_event_id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      );
      if (res?.ok) {
        await note(db, null);
        return;
      }
      if (res && res.status !== 404 && res.status !== 410) return;
    }
    const res = await api(db, link, `/calendars/${cal}/events`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (res?.ok) {
      const ev = (await res.json()) as { id?: string };
      if (ev.id)
        await db.from("bookings").update({ google_event_id: ev.id }).eq("id", b.id);
      await note(db, null);
    }
  } catch (e) {
    console.error("google sync failed", (e as Error).message);
  }
}
