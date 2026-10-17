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
  // Meal photos uploaded for a scan the member never saved: remove after a day.
  let strays = 0;
  try {
    const bucket = db.storage.from("meal-photos");
    const { data: folders } = await bucket.list("", { limit: 200 });
    for (const f of folders ?? []) {
      const { data: files } = await bucket.list(f.name, { limit: 200 });
      const old = (files ?? []).filter(
        (x) => x.created_at && new Date(x.created_at).getTime() < Date.now() - 86_400_000,
      );
      if (old.length === 0) continue;
      const paths = old.map((x) => `${f.name}/${x.name}`);
      const { data: used } = await db
        .from("meal_logs")
        .select("photo_path")
        .in("photo_path", paths);
      const keep = new Set((used ?? []).map((u: { photo_path: string }) => u.photo_path));
      const drop = paths.filter((p) => !keep.has(p));
      if (drop.length) {
        await bucket.remove(drop);
        strays += drop.length;
      }
    }
  } catch (e) {
    console.error("meal photo cleanup failed", (e as Error).message);
  }
  return NextResponse.json({
    meal_photos_removed: strays,
    crm_events_removed: crm.count ?? 0,
    notifications_removed: notes.count ?? 0,
    analytics_removed: events.count ?? 0,
  });
}
