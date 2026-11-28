import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { calendarFeedToken } from "@/lib/bookings";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const fmt = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
const esc = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\;");

/**
 * Private calendar feed of all consultations, for the coaches to subscribe to in Google Calendar
 * (Other calendars -> From URL). Read-only. The address is secret (shown in Admin -> Calendar).
 * Google refreshes subscribed calendars every few hours; the email for each new booking is instant.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const want = calendarFeedToken();
  const clean = token.replace(/\.ics$/, "");
  if (
    !want ||
    clean.length !== want.length ||
    !timingSafeEqual(Buffer.from(clean), Buffer.from(want))
  )
    return new NextResponse(null, { status: 404 });
  const db = createAdminSupabase();
  const { data } = await db
    .from("bookings")
    .select(
      "id, starts_at, ends_at, status, first_name, last_name, phone, email, goal, contact_id",
    )
    .gte("starts_at", new Date(Date.now() - 30 * 86400000).toISOString())
    .order("starts_at")
    .limit(1000);
  const app = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.chardikalafitness.com"
  ).replace(/\/$/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Chardikala Fitness//Consultations//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:CK consultations",
    "X-WR-TIMEZONE:America/Vancouver",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const b of (data ?? []) as Record<string, string>[]) {
    if (b.status === "cancelled") continue;
    const name = `${b.first_name} ${b.last_name}`.trim() || b.email;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${b.id}@chardikalafitness.com`,
      `DTSTAMP:${fmt(new Date().toISOString())}`,
      `DTSTART:${fmt(b.starts_at!)}`,
      `DTEND:${fmt(b.ends_at!)}`,
      `SUMMARY:${esc(`${b.status === "no_show" ? "(No-show) " : b.status === "completed" ? "(Done) " : ""}Consult: ${name}`)}`,
      `DESCRIPTION:${esc(`Phone: ${b.phone}\nEmail: ${b.email}\nGoal: ${b.goal}\n${app}/admin/${b.contact_id ? `leads/${b.contact_id}` : "calendar"}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR", "");
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
