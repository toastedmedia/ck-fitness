import { NextResponse } from "next/server";
import { dayLabel } from "@ck/core";
import { freeSlots } from "@/lib/bookings";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Free consultation times for the booking page (chardikalafitness.com/consult). No personal data. */
export async function GET() {
  const st = await freeSlots(createAdminSupabase());
  const open = st.ready && st.row.enabled;
  return NextResponse.json(
    {
      open,
      title: st.row.title,
      location: st.row.location,
      minutes: st.settings.slotMinutes,
      days: open
        ? st.days.map((d) => ({
            day: d.day,
            label: dayLabel(d.day),
            slots: d.slots.map((s) => ({ start: s.start, label: s.label })),
          }))
        : [],
    },
    { headers: { "cache-control": "no-store" } },
  );
}
