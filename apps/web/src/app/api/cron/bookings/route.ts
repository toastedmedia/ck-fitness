import { NextResponse, type NextRequest } from "next/server";
import { bookingReminderDue } from "@ck/core";
import { loadBookingState, sendBookingEmail, type BookingRow } from "@/lib/bookings";
import { cronGuard } from "@/lib/cron";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Every 15 minutes: consultation reminder emails (the day before and about an hour before). */
export async function GET(request: NextRequest) {
  const denied = cronGuard(request);
  if (denied) return denied;
  const db = createAdminSupabase();
  const now = new Date();
  const { data, error } = await db
    .from("bookings")
    .select("*")
    .eq("status", "booked")
    .gt("starts_at", now.toISOString())
    .lte("starts_at", new Date(now.getTime() + 25 * 3600000).toISOString());
  if (error) return NextResponse.json({ skipped: "bookings not ready (0036)" });
  const st = await loadBookingState(db, now);
  let sent = 0;
  for (const b of (data ?? []) as BookingRow[]) {
    const due = bookingReminderDue(b, now);
    if (!due) continue;
    // Mark first, so a retried run never sends twice.
    const col = due === "day" ? "reminder_day_at" : "reminder_hour_at";
    const { data: claimed } = await db
      .from("bookings")
      .update({ [col]: now.toISOString() })
      .eq("id", b.id)
      .is(col, null)
      .select("id");
    if (!claimed?.length) continue;
    if (
      await sendBookingEmail(b, due === "day" ? "reminder_day" : "reminder_hour", st.row)
    )
      sent++;
  }
  return NextResponse.json({ sent });
}
