import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import {
  BOOKING_TZ,
  DEFAULT_BOOKING_SETTINGS,
  availableSlots,
  dayLabel,
  googleCalendarLink,
  isBookable,
  renderCampaign,
  timeLabel,
  type AvailabilityWindow,
  type BookingSettings,
  type TimeRange,
} from "@ck/core";
import { dayKey } from "@ck/core";
import { sendRaw } from "@/lib/email/send";
import { contactName, logActivity, stageForBooking, upsertContact } from "@/lib/leads";
import type { createAdminSupabase } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminSupabase>;

export const APP_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.chardikalafitness.com"
).replace(/\/$/, "");

export interface SettingsRow {
  enabled: boolean;
  slot_minutes: number;
  buffer_minutes: number;
  min_notice_minutes: number;
  max_days_ahead: number;
  timezone: string;
  title: string;
  location: string;
  notify_emails: string;
}
export interface BookingRow {
  id: string;
  contact_id: string | null;
  starts_at: string;
  ends_at: string;
  status: "booked" | "cancelled" | "completed" | "no_show";
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  goal: string;
  notes: string;
  source: string;
  manage_token: string;
  created_at: string;
  cancelled_at: string | null;
  reminder_day_at: string | null;
  reminder_hour_at: string | null;
}

export const DEFAULT_SETTINGS_ROW: SettingsRow = {
  enabled: false,
  slot_minutes: 15,
  buffer_minutes: 0,
  min_notice_minutes: 120,
  max_days_ahead: 21,
  timezone: BOOKING_TZ,
  title: "Free consultation with Chanveer",
  location: "Phone call (we call the number you give us)",
  notify_emails: "",
};

export const toSettings = (r: SettingsRow): BookingSettings => ({
  slotMinutes: r.slot_minutes,
  bufferMinutes: r.buffer_minutes,
  minNoticeMinutes: r.min_notice_minutes,
  maxDaysAhead: r.max_days_ahead,
  timezone: r.timezone || DEFAULT_BOOKING_SETTINGS.timezone,
});

/** Everything needed to work out free times. `ready` is false before the database update (0036). */
export async function loadBookingState(db: Db, now = new Date()) {
  const [s, a, b, k] = await Promise.all([
    db.from("booking_settings").select("*").eq("id", 1).maybeSingle(),
    db.from("booking_availability").select("weekday, start_time, end_time"),
    db
      .from("booking_blocks")
      .select("id, starts_at, ends_at, reason")
      .gte("ends_at", new Date(now.getTime() - 86400000).toISOString())
      .order("starts_at"),
    db
      .from("bookings")
      .select("starts_at, ends_at")
      .eq("status", "booked")
      .gte("ends_at", new Date(now.getTime() - 86400000).toISOString()),
  ]);
  const row = { ...DEFAULT_SETTINGS_ROW, ...((s.data as SettingsRow | null) ?? {}) };
  const availability: AvailabilityWindow[] = (
    (a.data ?? []) as { weekday: number; start_time: string; end_time: string }[]
  ).map((w) => ({ weekday: w.weekday, start: w.start_time, end: w.end_time }));
  return {
    ready: !s.error,
    row,
    settings: toSettings(row),
    availability,
    blocks: (b.data ?? []) as (TimeRange & { id: string; reason: string })[],
    busy: (k.data ?? []) as TimeRange[],
  };
}

export async function freeSlots(db: Db, now = new Date()) {
  const st = await loadBookingState(db, now);
  return {
    ...st,
    days: availableSlots({
      settings: st.settings,
      availability: st.availability,
      blocks: st.blocks,
      busy: st.busy,
      now,
    }),
  };
}

export const newToken = () => randomBytes(18).toString("base64url");

export const manageUrl = (token: string) => `${APP_URL}/booking/${token}`;

export const whenText = (iso: string, tz = BOOKING_TZ) =>
  `${dayLabel(dayKey(new Date(iso), tz))} at ${timeLabel(iso, tz)} (Pacific time)`;

/** Private calendar feed address for the coaches (subscribe once in Google Calendar). */
export function calendarFeedToken(): string | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return createHmac("sha256", secret)
    .update("ck-booking-feed-v1")
    .digest("base64url")
    .slice(0, 32);
}

export interface NewBooking {
  start: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  goal: string;
  source?: string;
  utm?: Record<string, string>;
  consent?: boolean;
  notes?: string;
  /** Staff booking: may pick any time that is not already taken (ignores opening hours). */
  byStaff?: string | null;
  /** Staff only: do not email the person. */
  silent?: boolean;
}

export type BookResult =
  | { ok: true; booking: BookingRow; contactId: string | null }
  | { ok: false; reason: "closed" | "taken" | "invalid" | "error" };

/** Saves a booking after checking the time is still free, files it in the CRM and sends the emails. */
export async function createBooking(db: Db, b: NewBooking): Promise<BookResult> {
  const start = new Date(b.start);
  if (Number.isNaN(start.getTime())) return { ok: false, reason: "invalid" };
  const st = await loadBookingState(db);
  if (!st.ready) return { ok: false, reason: "error" };
  if (!b.byStaff) {
    if (!st.row.enabled) return { ok: false, reason: "closed" };
    if (
      !isBookable(start.toISOString(), {
        settings: st.settings,
        availability: st.availability,
        blocks: st.blocks,
        busy: st.busy,
        now: new Date(),
      })
    )
      return { ok: false, reason: "taken" };
  }
  const end = new Date(start.getTime() + st.settings.slotMinutes * 60000);
  if (
    b.byStaff &&
    st.busy.some((x) => start < new Date(x.ends_at) && new Date(x.starts_at) < end)
  )
    return { ok: false, reason: "taken" };

  const contact = await upsertContact(db, {
    email: b.email,
    first_name: b.first_name,
    last_name: b.last_name,
    phone: b.phone,
    goal: b.goal,
    source: b.source ?? "consult_booking",
    utm: b.utm,
    consent: b.consent,
    created_by: b.byStaff ?? null,
  });
  const { data, error } = await db
    .from("bookings")
    .insert({
      contact_id: contact?.id ?? null,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      first_name: b.first_name.slice(0, 80),
      last_name: b.last_name.slice(0, 80),
      email: b.email.slice(0, 200),
      phone: b.phone.slice(0, 40),
      goal: b.goal.slice(0, 1000),
      notes: (b.notes ?? "").slice(0, 2000),
      source: b.byStaff ? "staff" : (b.source ?? "website"),
      utm: b.utm ?? {},
      manage_token: newToken(),
      created_by: b.byStaff ?? null,
    })
    .select("*")
    .single();
  if (error || !data) {
    // The unique index: someone took this time a moment ago.
    if (error?.code === "23505") return { ok: false, reason: "taken" };
    console.error("booking failed", error?.message);
    return { ok: false, reason: "error" };
  }
  const booking = data as BookingRow;
  if (contact) {
    await stageForBooking(db, contact.id, contact.stage);
    await logActivity(
      db,
      contact.id,
      "booking",
      `Consultation booked for ${whenText(booking.starts_at)}${b.byStaff ? " (added by the team)" : ""}.`,
      b.byStaff ?? null,
    );
  }
  if (!b.silent) await sendBookingEmail(booking, "confirmed", st.row);
  if (!b.byStaff) await notifyTeam(booking, st.row, "new", contact?.id ?? null);
  return { ok: true, booking, contactId: contact?.id ?? null };
}

export async function cancelBooking(
  db: Db,
  booking: BookingRow,
  by: "member" | "staff",
  staffId: string | null = null,
  tellPerson = true,
) {
  if (booking.status !== "booked") return;
  await db
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", booking.id);
  const st = await loadBookingState(db);
  if (booking.contact_id)
    await logActivity(
      db,
      booking.contact_id,
      "booking",
      `Consultation on ${whenText(booking.starts_at)} cancelled by ${by === "member" ? "the client" : "the team"}.`,
      staffId,
    );
  if (tellPerson) await sendBookingEmail(booking, "cancelled", st.row);
  if (by === "member") await notifyTeam(booking, st.row, "cancelled", booking.contact_id);
}

/** Moves a booking to a new start. Members must pick a free time; staff may pick any time not taken. */
export async function moveBooking(
  db: Db,
  booking: BookingRow,
  newStart: string,
  by: "member" | "staff",
  staffId: string | null = null,
): Promise<"ok" | "taken" | "invalid" | "closed"> {
  const start = new Date(newStart);
  if (Number.isNaN(start.getTime()) || booking.status !== "booked") return "invalid";
  const st = await loadBookingState(db);
  const busy = st.busy.filter(
    (x) =>
      new Date(x.starts_at).toISOString() !== new Date(booking.starts_at).toISOString(),
  );
  const end = new Date(start.getTime() + st.settings.slotMinutes * 60000);
  if (by === "member") {
    if (!st.row.enabled) return "closed";
    const ok = isBookable(start.toISOString(), {
      settings: st.settings,
      availability: st.availability,
      blocks: st.blocks,
      busy,
      now: new Date(),
    });
    if (!ok) return "taken";
  } else if (busy.some((x) => start < new Date(x.ends_at) && new Date(x.starts_at) < end))
    return "taken";
  const { error } = await db
    .from("bookings")
    .update({
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      reminder_day_at: null,
      reminder_hour_at: null,
    })
    .eq("id", booking.id)
    .eq("status", "booked");
  if (error) return error.code === "23505" ? "taken" : "invalid";
  const moved = {
    ...booking,
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
  };
  if (booking.contact_id)
    await logActivity(
      db,
      booking.contact_id,
      "booking",
      `Consultation moved from ${whenText(booking.starts_at)} to ${whenText(moved.starts_at)} by ${by === "member" ? "the client" : "the team"}.`,
      staffId,
    );
  await sendBookingEmail(moved, "moved", st.row);
  if (by === "member") await notifyTeam(moved, st.row, "moved", booking.contact_id);
  return "ok";
}

/* ------------------------------------------------------------ emails */

const REASON =
  "You get this email because you booked a consultation with Chardikala Fitness & Performance.";

export async function sendBookingEmail(
  b: BookingRow,
  kind: "confirmed" | "moved" | "cancelled" | "reminder_day" | "reminder_hour",
  s: SettingsRow,
) {
  const when = whenText(b.starts_at, s.timezone);
  const phoneLine = b.phone
    ? `We will call you at ${b.phone}. If that number is wrong, reply to this email.`
    : `How we meet: ${s.location}.`;
  const copy = {
    confirmed: {
      subject: "Your free consultation is booked",
      heading: "You're booked in",
      body: `Hi {{name}},\n\nYour ${s.title.toLowerCase()} is booked for ${when}.\n\n${phoneLine}\n\nBefore the call, think about:\n- your main goal for the next 3 months\n- how many days a week you can train\n- any injuries or health conditions we should know about\n\nNeed a different time? Use the button below to change or cancel.`,
    },
    moved: {
      subject: "Your consultation time has changed",
      heading: "New time confirmed",
      body: `Hi {{name}},\n\nYour consultation is now on ${when}.\n\n${phoneLine}\n\nUse the button below if you need to change it again.`,
    },
    cancelled: {
      subject: "Your consultation was cancelled",
      heading: "Booking cancelled",
      body: `Hi {{name}},\n\nYour consultation on ${when} has been cancelled.\n\nWhenever you're ready, you can book a new time at chardikalafitness.com/consult or message us on WhatsApp.`,
    },
    reminder_day: {
      subject: "Reminder: your consultation is tomorrow",
      heading: "See you soon",
      body: `Hi {{name}},\n\nA quick reminder: your consultation with Chanveer is on ${when}.\n\n${phoneLine}`,
    },
    reminder_hour: {
      subject: "Your consultation starts soon",
      heading: "Starting soon",
      body: `Hi {{name}},\n\nYour consultation with Chanveer starts at ${timeLabel(b.starts_at, s.timezone)} (Pacific time).\n\n${phoneLine}`,
    },
  }[kind];
  const cancelled = kind === "cancelled";
  const mail = renderCampaign(
    {
      subject: copy.subject,
      preheader: cancelled ? "" : when,
      heading: copy.heading,
      body: copy.body,
      imageUrl: null,
      ctaLabel: cancelled ? "Book a new time" : "See, change or cancel",
      ctaUrl: cancelled
        ? "https://chardikalafitness.com/consult"
        : manageUrl(b.manage_token),
    },
    { name: b.first_name },
    { siteUrl: APP_URL, reason: REASON },
  );
  return sendRaw({ to: b.email, ...mail });
}

/** Emails the coaches (Admin -> Calendar -> Settings -> "Tell these emails"). */
async function notifyTeam(
  b: BookingRow,
  s: SettingsRow,
  kind: "new" | "moved" | "cancelled",
  contactId: string | null,
) {
  const to = s.notify_emails
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    .slice(0, 5);
  if (!to.length) return;
  const name = contactName(b);
  const when = whenText(b.starts_at, s.timezone);
  const title = {
    new: "New consultation",
    moved: "Consultation moved",
    cancelled: "Consultation cancelled",
  }[kind];
  const gcal = googleCalendarLink({
    start: b.starts_at,
    end: b.ends_at,
    title: `Consult: ${name}`,
    details: `Phone: ${b.phone}\nEmail: ${b.email}\nGoal: ${b.goal}`,
  });
  const mail = renderCampaign(
    {
      subject: `${title}: ${name}, ${when}`,
      preheader: when,
      heading: title,
      body: `${name} ${kind === "new" ? "booked" : kind === "moved" ? "moved the consultation to" : "cancelled"} ${when}.\n\n- Phone: ${b.phone || "not given"}\n- Email: ${b.email}\n- Goal: ${b.goal || "not given"}\n\n${kind === "cancelled" ? "" : `Add it to your Google Calendar: ${gcal}`}`,
      imageUrl: null,
      ctaLabel: "Open in Admin",
      ctaUrl: contactId ? `/admin/leads/${contactId}` : "/admin/calendar",
    },
    { name: "team" },
    {
      siteUrl: APP_URL,
      reason:
        "You get this because your email is listed in Admin -> Calendar -> Settings.",
    },
  );
  for (const e of to) await sendRaw({ to: e, ...mail });
}
