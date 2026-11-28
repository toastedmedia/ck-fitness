import { after, NextResponse, type NextRequest } from "next/server";
import { cleanEmail, normalizePhone } from "@ck/core";
import { createBooking, manageUrl, whenText } from "@/lib/bookings";
import { sendCapi } from "@/lib/meta-capi";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const OUR_SITES = /^https:\/\/(www\.|app\.)?chardikalafitness\.com(\/|$)/;
const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
];

/** A few tries per minute per visitor (per server instance), against bots filling the calendar. */
const hits = new Map<string, number[]>();
function tooMany(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 5;
}

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** Books a free consultation from the website. Saves the person in the CRM and emails both sides. */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  if (!OUR_SITES.test(origin) && process.env.NODE_ENV === "production")
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "?";
  if (tooMany(ip))
    return NextResponse.json(
      { error: "Too many tries. Wait a minute and try again." },
      { status: 429 },
    );
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b)
    return NextResponse.json(
      { error: "Something went wrong. Try again." },
      { status: 400 },
    );
  // Hidden field only bots fill in.
  if (str(b.website, 100)) return NextResponse.json({ ok: true, when: "" });
  const first = str(b.first_name, 80);
  const last = str(b.last_name, 80);
  const email = cleanEmail(str(b.email, 200));
  const phone = normalizePhone(str(b.phone, 40)) ?? "";
  const goal = str(b.goal, 1000);
  const start = str(b.start, 40);
  if (!first)
    return NextResponse.json({ error: "Please add your first name." }, { status: 400 });
  if (!email)
    return NextResponse.json(
      { error: "Please check your email address." },
      { status: 400 },
    );
  if (!phone)
    return NextResponse.json(
      { error: "Please add a phone number we can call." },
      { status: 400 },
    );
  if (!start) return NextResponse.json({ error: "Please pick a time." }, { status: 400 });
  const utmIn = (b.utm && typeof b.utm === "object" ? b.utm : {}) as Record<
    string,
    unknown
  >;
  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = str(utmIn[k], 200);
    if (v) utm[k] = v;
  }
  const db = createAdminSupabase();
  // At most two upcoming consultations per email.
  const { count } = await db
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .ilike("email", email)
    .eq("status", "booked")
    .gte("starts_at", new Date().toISOString());
  if ((count ?? 0) >= 2)
    return NextResponse.json(
      { error: "You already have a consultation booked. Check your email to change it." },
      { status: 409 },
    );
  const r = await createBooking(db, {
    start,
    first_name: first,
    last_name: last,
    email,
    phone,
    goal,
    utm,
    consent: b.consent === true,
    source: "consult_booking",
  });
  if (!r.ok) {
    const msg = {
      closed:
        "Online booking is paused right now. Message us on WhatsApp and we'll find a time.",
      taken: "Sorry, that time was just taken. Please pick another one.",
      invalid: "Please pick a time from the list.",
      error: "Something went wrong. Try again, or message us on WhatsApp.",
    }[r.reason];
    return NextResponse.json(
      { error: msg, reason: r.reason },
      { status: r.reason === "taken" ? 409 : 400 },
    );
  }
  const eventId = str(b.event_id, 100) || undefined;
  const page = str(b.page, 500);
  after(() =>
    sendCapi({
      event_name: "Schedule",
      event_id: eventId,
      event_source_url: OUR_SITES.test(page)
        ? page
        : "https://chardikalafitness.com/consult",
      custom_data: { content_name: "Free consultation" },
      email,
    }),
  );
  return NextResponse.json({
    ok: true,
    when: whenText(r.booking.starts_at),
    manage: manageUrl(r.booking.manage_token),
  });
}
