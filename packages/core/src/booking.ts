/**
 * Consultation booking rules: which times can be booked, in the studio's time zone (Vancouver),
 * including daylight-saving changes. Pure functions so the booking page, the admin calendar and the
 * server check all agree.
 */
import { addDays, dayKey, dayOfWeek } from "./dates";

export const BOOKING_TZ = "America/Vancouver";

export interface BookingSettings {
  /** Length of one consultation in minutes. */
  slotMinutes: number;
  /** Free minutes kept after each booking. */
  bufferMinutes: number;
  /** How far ahead someone must book (minutes). */
  minNoticeMinutes: number;
  /** How many days ahead can be booked. */
  maxDaysAhead: number;
  timezone: string;
}

export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  slotMinutes: 15,
  bufferMinutes: 0,
  minNoticeMinutes: 120,
  maxDaysAhead: 21,
  timezone: BOOKING_TZ,
};

/** Weekly opening hours; weekday 0 = Monday ... 6 = Sunday; times "HH:MM" local. */
export interface AvailabilityWindow {
  weekday: number;
  start: string;
  end: string;
}
export interface TimeRange {
  starts_at: string;
  ends_at: string;
}

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isTime = (s: string) => HHMM.test(s);
const minutesOf = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** Minutes the zone is ahead of UTC at this moment (Vancouver: -480 in winter, -420 in summer). */
export function zoneOffsetMinutes(at: Date, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** A local wall-clock time ("2026-12-01", "19:15") in the zone, as a real moment. */
export function zonedTime(day: string, time: string, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
  let t = guess - zoneOffsetMinutes(new Date(guess), tz) * 60000;
  // Second pass settles times right after a daylight-saving change.
  t = guess - zoneOffsetMinutes(new Date(t), tz) * 60000;
  return new Date(t);
}

/** "7:15 PM" in the zone. */
export function timeLabel(iso: string | Date, tz: string = BOOKING_TZ): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "Tuesday, December 1" for a day key. */
export function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${day}T12:00:00Z`));
}

const overlaps = (aStart: number, aEnd: number, b: TimeRange, padMs = 0) =>
  aStart < new Date(b.ends_at).getTime() + padMs &&
  new Date(b.starts_at).getTime() - padMs < aEnd;

export interface SlotDay {
  day: string;
  slots: { start: string; end: string; label: string }[];
}

/**
 * Bookable consultation times, day by day, from today until `maxDaysAhead`, honouring the weekly
 * hours, days off/blocked times, existing bookings (plus buffer) and the minimum notice.
 */
export function availableSlots(input: {
  settings: BookingSettings;
  availability: AvailabilityWindow[];
  blocks: TimeRange[];
  busy: TimeRange[];
  now: Date;
  /** Optional: only these days (YYYY-MM-DD). */
  onlyDay?: string;
}): SlotDay[] {
  const { settings: s, now } = input;
  const tz = s.timezone || BOOKING_TZ;
  const slotMs = Math.max(5, s.slotMinutes) * 60000;
  const padMs = Math.max(0, s.bufferMinutes) * 60000;
  const earliest = now.getTime() + Math.max(0, s.minNoticeMinutes) * 60000;
  const today = dayKey(now, tz);
  const out: SlotDay[] = [];
  for (let i = 0; i <= Math.max(0, s.maxDaysAhead); i++) {
    const day = addDays(today, i);
    if (input.onlyDay && day !== input.onlyDay) continue;
    const wd = dayOfWeek(day);
    const windows = input.availability
      .filter((w) => w.weekday === wd && isTime(w.start) && isTime(w.end))
      .sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
    const slots: SlotDay["slots"] = [];
    for (const w of windows) {
      const wStart = zonedTime(day, w.start, tz).getTime();
      const wEnd = zonedTime(day, w.end, tz).getTime();
      for (let t = wStart; t + slotMs <= wEnd; t += slotMs) {
        const end = t + slotMs;
        if (t < earliest) continue;
        if (input.blocks.some((b) => overlaps(t, end, b))) continue;
        if (input.busy.some((b) => overlaps(t, end, b, padMs))) continue;
        const start = new Date(t).toISOString();
        if (slots.some((x) => x.start === start)) continue;
        slots.push({
          start,
          end: new Date(end).toISOString(),
          label: timeLabel(start, tz),
        });
      }
    }
    if (slots.length) out.push({ day, slots });
  }
  return out;
}

/** Server check before saving a booking: is this exact start still free? */
export function isBookable(
  start: string,
  input: Omit<Parameters<typeof availableSlots>[0], "onlyDay">,
): boolean {
  const day = dayKey(new Date(start), input.settings.timezone || BOOKING_TZ);
  return availableSlots({ ...input, onlyDay: day }).some((d) =>
    d.slots.some((x) => x.start === new Date(start).toISOString()),
  );
}

/** Calendar file (.ics) for one booking, so it can be added to any calendar app. */
export function bookingIcs(b: {
  uid: string;
  start: string;
  end: string;
  title: string;
  description?: string;
  location?: string;
  cancelled?: boolean;
}): string {
  const fmt = (iso: string) =>
    new Date(iso)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const esc = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chardikala Fitness//Consultations//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${b.cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${b.uid}@chardikalafitness.com`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(b.start)}`,
    `DTEND:${fmt(b.end)}`,
    `SUMMARY:${esc(b.title)}`,
    ...(b.description ? [`DESCRIPTION:${esc(b.description)}`] : []),
    ...(b.location ? [`LOCATION:${esc(b.location)}`] : []),
    `STATUS:${b.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** "Add to Google Calendar" link for one booking. */
export function googleCalendarLink(b: {
  start: string;
  end: string;
  title: string;
  details?: string;
  location?: string;
}): string {
  const f = (iso: string) =>
    new Date(iso)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: b.title,
    dates: `${f(b.start)}/${f(b.end)}`,
    ...(b.details ? { details: b.details } : {}),
    ...(b.location ? { location: b.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/* ------------------------------------------------------------------ CRM */

export const CRM_STAGES = [
  { key: "new", label: "New lead" },
  { key: "contacted", label: "Contacted" },
  { key: "consult_booked", label: "Consult booked" },
  { key: "consult_done", label: "Consult done" },
  { key: "client", label: "Client" },
  { key: "lost", label: "Lost" },
] as const;
export type CrmStage = (typeof CRM_STAGES)[number]["key"];
export const isStage = (s: string): s is CrmStage => CRM_STAGES.some((x) => x.key === s);
export const stageLabel = (s: string) => CRM_STAGES.find((x) => x.key === s)?.label ?? s;

export const CRM_SOURCES = [
  { key: "consult_booking", label: "Consultation booking" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "instagram", label: "Instagram DM" },
  { key: "facebook", label: "Facebook" },
  { key: "website", label: "Website" },
  { key: "app", label: "App sign-up" },
  { key: "challenge", label: "Winter Challenge" },
  { key: "referral", label: "Referral" },
  { key: "walk_in", label: "Walk-in / phone" },
  { key: "other", label: "Other" },
] as const;
export const sourceLabel = (s: string) =>
  CRM_SOURCES.find((x) => x.key === s)?.label ?? s;

export const ACTIVITY_KINDS = [
  { key: "note", label: "Note" },
  { key: "call", label: "Call" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "meeting", label: "Met in person" },
] as const;

/** Lower-case, trimmed email, or null when it is not a plausible address. */
export function cleanEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200 ? e : null;
}

/**
 * When a consultation is booked, a contact moves forward to "Consult booked", but never backwards
 * (a client or someone already past the consult keeps their stage).
 */
export function stageAfterBooking(current: string | null | undefined): CrmStage {
  return current === "client" || current === "consult_done" ? current : "consult_booked";
}

/**
 * Which reminder a booking needs now: "day" (within 24 h, only if booked more than 36 h before) or
 * "hour" (within 75 minutes, only if booked more than 3 h before). Each is sent once.
 */
export function bookingReminderDue(
  b: {
    starts_at: string;
    created_at: string;
    reminder_day_at: string | null;
    reminder_hour_at: string | null;
  },
  now: Date,
): "day" | "hour" | null {
  const start = new Date(b.starts_at).getTime();
  const lead = start - new Date(b.created_at).getTime();
  const left = start - now.getTime();
  if (left <= 0) return null;
  const H = 3600000;
  if (!b.reminder_hour_at && left <= 75 * 60000 && lead > 3 * H) return "hour";
  if (
    !b.reminder_day_at &&
    !b.reminder_hour_at &&
    left <= 24 * H &&
    left > 75 * 60000 &&
    lead > 36 * H
  )
    return "day";
  return null;
}

/** "+16045550101" -> "+1 604-555-0101" (North American numbers); anything else unchanged. */
export function phoneLabel(phone: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone.trim());
  return m ? `+1 ${m[1]}-${m[2]}-${m[3]}` : phone;
}
