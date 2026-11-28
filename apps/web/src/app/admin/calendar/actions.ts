"use server";

import { redirect } from "next/navigation";
import { BOOKING_TZ, cleanEmail, isTime, normalizePhone, zonedTime } from "@ck/core";
import { audit, requireStaff } from "@/lib/admin";
import {
  cancelBooking,
  createBooking,
  moveBooking,
  sendBookingEmail,
  loadBookingState,
  type BookingRow,
} from "@/lib/bookings";
import { CRM_ROLES, logActivity, setStage } from "@/lib/leads";
import { disconnectGoogle, syncBookingEvent } from "@/lib/google-calendar";

const staff = () => requireStaff([...CRM_ROLES]);
const str = (f: FormData, k: string, max = 500) =>
  String(f.get(k) ?? "")
    .trim()
    .slice(0, max);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function booking(db: Awaited<ReturnType<typeof staff>>["db"], id: string) {
  const { data } = await db.from("bookings").select("*").eq("id", id).maybeSingle();
  if (!data) redirect("/admin/calendar?error=missing");
  return data as BookingRow;
}

export async function staffBook(formData: FormData): Promise<void> {
  const { db, user, supabase } = await staff();
  const day = str(formData, "day", 10);
  const time = str(formData, "time", 5);
  if (!DAY.test(day) || !isTime(time)) redirect("/admin/calendar?error=time#book");
  let first = str(formData, "first_name", 80);
  let last = str(formData, "last_name", 80);
  let email = cleanEmail(str(formData, "email", 200));
  let phone = normalizePhone(str(formData, "phone", 40)) ?? "";
  const contactId = str(formData, "contact_id", 40);
  if (contactId) {
    const { data: c } = await db
      .from("crm_contacts")
      .select("*")
      .eq("id", contactId)
      .maybeSingle();
    if (c) {
      first ||= c.first_name;
      last ||= c.last_name;
      email ||= c.email;
      phone ||= c.phone ?? "";
    }
  }
  if (!email)
    redirect(`/admin/calendar?error=email${contactId ? `&book=${contactId}` : ""}#book`);
  const r = await createBooking(db, {
    start: zonedTime(day, time, BOOKING_TZ).toISOString(),
    first_name: first,
    last_name: last,
    email,
    phone,
    goal: str(formData, "goal", 1000),
    notes: str(formData, "notes", 2000),
    source: "walk_in",
    byStaff: user.id,
    silent: formData.get("email_her") !== "on",
  });
  if (!r.ok) redirect(`/admin/calendar?error=${r.reason}#book`);
  await audit(supabase, user.id, "booking.create", r.booking.id);
  redirect(`/admin/calendar?saved=booked&day=${day}`);
}

export async function setBookingStatus(
  id: string,
  status: "completed" | "no_show" | "booked",
): Promise<void> {
  const { db, user } = await staff();
  const b = await booking(db, id);
  await db.from("bookings").update({ status }).eq("id", id);
  await syncBookingEvent(db, { ...b, status });
  if (b.contact_id) {
    if (status === "completed") {
      const { data } = await db
        .from("crm_contacts")
        .select("stage")
        .eq("id", b.contact_id)
        .maybeSingle();
      if (data && ["new", "contacted", "consult_booked"].includes(data.stage))
        await setStage(db, b.contact_id, "consult_done", user.id, "Consultation done");
    } else if (status === "no_show")
      await logActivity(
        db,
        b.contact_id,
        "booking",
        "Did not show up for the consultation.",
        user.id,
      );
  }
  redirect("/admin/calendar?saved=status");
}

export async function staffCancel(id: string, formData: FormData): Promise<void> {
  const { db, user, supabase } = await staff();
  const b = await booking(db, id);
  await cancelBooking(db, b, "staff", user.id, formData.get("tell") === "on");
  await audit(supabase, user.id, "booking.cancel", id);
  redirect("/admin/calendar?saved=cancelled");
}

export async function staffMove(id: string, formData: FormData): Promise<void> {
  const { db, user, supabase } = await staff();
  const day = str(formData, "day", 10);
  const time = str(formData, "time", 5);
  if (!DAY.test(day) || !isTime(time)) redirect("/admin/calendar?error=time");
  const b = await booking(db, id);
  const r = await moveBooking(
    db,
    b,
    zonedTime(day, time, BOOKING_TZ).toISOString(),
    "staff",
    user.id,
  );
  if (r !== "ok") redirect(`/admin/calendar?error=${r}`);
  await audit(supabase, user.id, "booking.move", id, { day, time });
  redirect(`/admin/calendar?saved=moved&day=${day}`);
}

export async function resendConfirmation(id: string): Promise<void> {
  const { db } = await staff();
  const b = await booking(db, id);
  const st = await loadBookingState(db);
  await sendBookingEmail(b, "confirmed", st.row);
  redirect("/admin/calendar?saved=emailed");
}

export async function saveBookingSettings(formData: FormData): Promise<void> {
  const { db, user, supabase } = await staff();
  const n = (k: string, min: number, max: number, d: number) => {
    const v = Math.round(Number(formData.get(k)));
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
  };
  const notify = str(formData, "notify_emails", 500)
    .split(/[\s,;]+/)
    .map((e) => cleanEmail(e))
    .filter(Boolean)
    .slice(0, 5)
    .join(", ");
  const { error } = await db.from("booking_settings").upsert({
    id: 1,
    enabled: formData.get("enabled") === "on",
    slot_minutes: n("slot_minutes", 5, 240, 15),
    buffer_minutes: n("buffer_minutes", 0, 120, 0),
    min_notice_minutes: n("notice_hours", 0, 168, 2) * 60,
    max_days_ahead: n("max_days_ahead", 1, 120, 21),
    title: str(formData, "title", 120) || "Free consultation with Chanveer",
    location:
      str(formData, "location", 200) || "Phone call (we call the number you give us)",
    notify_emails: notify,
    updated_at: new Date().toISOString(),
  });
  if (error) redirect("/admin/calendar?view=settings&error=save");
  await audit(supabase, user.id, "booking.settings", "booking_settings");
  redirect("/admin/calendar?view=settings&saved=settings");
}

export async function addWindow(formData: FormData): Promise<void> {
  const { db } = await staff();
  const days = formData
    .getAll("weekday")
    .map(Number)
    .filter((d) => d >= 0 && d <= 6);
  const start = str(formData, "start", 5);
  const end = str(formData, "end", 5);
  if (!days.length || !isTime(start) || !isTime(end) || end <= start)
    redirect("/admin/calendar?view=settings&error=window");
  await db
    .from("booking_availability")
    .insert(days.map((weekday) => ({ weekday, start_time: start, end_time: end })));
  redirect("/admin/calendar?view=settings&saved=hours");
}

export async function removeWindow(id: string): Promise<void> {
  const { db } = await staff();
  await db.from("booking_availability").delete().eq("id", id);
  redirect("/admin/calendar?view=settings&saved=hours");
}

export async function addBlock(formData: FormData): Promise<void> {
  const { db, user } = await staff();
  const from = str(formData, "from", 10);
  const to = str(formData, "to", 10) || from;
  const t1 = str(formData, "from_time", 5);
  const t2 = str(formData, "to_time", 5);
  if (!DAY.test(from) || !DAY.test(to) || to < from)
    redirect("/admin/calendar?view=settings&error=block");
  const starts = zonedTime(from, isTime(t1) ? t1 : "00:00", BOOKING_TZ);
  const ends = isTime(t2)
    ? zonedTime(to, t2, BOOKING_TZ)
    : new Date(zonedTime(to, "23:59", BOOKING_TZ).getTime() + 60000);
  if (ends <= starts) redirect("/admin/calendar?view=settings&error=block");
  await db.from("booking_blocks").insert({
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    reason: str(formData, "reason", 200),
    created_by: user.id,
  });
  redirect("/admin/calendar?view=settings&saved=block");
}

export async function removeBlock(id: string): Promise<void> {
  const { db } = await staff();
  await db.from("booking_blocks").delete().eq("id", id);
  redirect("/admin/calendar?view=settings&saved=block");
}

export async function googleDisconnect(): Promise<void> {
  const { db, user, supabase } = await staff();
  await disconnectGoogle(db);
  await audit(supabase, user.id, "booking.google_disconnect", "google_calendar_link");
  redirect("/admin/calendar?view=settings&saved=google");
}

export async function googleBlockBusy(formData: FormData): Promise<void> {
  const { db } = await staff();
  await db
    .from("google_calendar_link")
    .update({ block_busy: formData.get("block_busy") === "on" })
    .eq("id", 1);
  redirect("/admin/calendar?view=settings&saved=google");
}

/** Adds every upcoming booking that is not in Google yet (after connecting). */
export async function googleSyncUpcoming(): Promise<void> {
  const { db } = await staff();
  const { data } = await db
    .from("bookings")
    .select("*")
    .eq("status", "booked")
    .is("google_event_id", null)
    .gte("starts_at", new Date().toISOString())
    .limit(200);
  for (const b of (data ?? []) as BookingRow[]) await syncBookingEvent(db, b);
  redirect(`/admin/calendar?view=settings&saved=google_sync&n=${(data ?? []).length}`);
}
