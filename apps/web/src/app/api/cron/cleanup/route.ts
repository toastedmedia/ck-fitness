import { NextResponse, type NextRequest } from "next/server";
import { cronGuard } from "@/lib/cron";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/**
 * Daily housekeeping so tables (and costs) do not grow forever. Only old, low-value rows go:
 * CRM events already sent, notifications she has read, and analytics older than two years.
 */
export async function GET(request: NextRequest) {
  const denied = cronGuard(request);
  if (denied) return denied;
  const db = createAdminSupabase();
  const [crm, notes, events] = await Promise.all([
    db
      .from("crm_sync_events")
      .delete({ count: "exact" })
      .eq("status", "sent")
      .lt("sent_at", daysAgo(90)),
    db
      .from("notifications")
      .delete({ count: "exact" })
      .not("read_at", "is", null)
      .lt("read_at", daysAgo(180)),
    db.from("analytics_events").delete({ count: "exact" }).lt("created_at", daysAgo(730)),
  ]);
  return NextResponse.json({
    crm_events_removed: crm.count ?? 0,
    notifications_removed: notes.count ?? 0,
    analytics_removed: events.count ?? 0,
  });
}
