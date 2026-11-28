import { NextResponse } from "next/server";
import { bookingIcs } from "@ck/core";
import { loadBookingState } from "@/lib/bookings";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** One booking as a calendar file (Apple Calendar, Outlook, Google). The link is in her emails. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[\w-]{20,40}$/.test(token)) return new NextResponse(null, { status: 404 });
  const db = createAdminSupabase();
  const { data } = await db
    .from("bookings")
    .select("id, starts_at, ends_at, status")
    .eq("manage_token", token)
    .maybeSingle();
  if (!data) return new NextResponse(null, { status: 404 });
  const st = await loadBookingState(db);
  const ics = bookingIcs({
    uid: data.id as string,
    start: data.starts_at as string,
    end: data.ends_at as string,
    title: "Free consultation, Chardikala Fitness",
    description: "Coach Chanveer will call you. To change: chardikalafitness.com/consult",
    location: st.row.location,
    cancelled: data.status === "cancelled",
  });
  return new NextResponse(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="consultation.ics"',
      "cache-control": "no-store",
    },
  });
}
