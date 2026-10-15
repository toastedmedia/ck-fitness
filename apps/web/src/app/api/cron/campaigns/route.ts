import { NextResponse, type NextRequest } from "next/server";
import { cronGuard } from "@/lib/cron";
import { processCampaign } from "@/lib/email/campaign";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every 5 minutes: keeps sending any marketing email that is still going out. */
export async function GET(request: NextRequest) {
  const denied = cronGuard(request);
  if (denied) return denied;
  const db = createAdminSupabase();
  const { data } = await db
    .from("email_campaigns")
    .select("id")
    .eq("status", "sending")
    .limit(3);
  const results = [];
  for (const c of (data ?? []) as { id: string }[])
    results.push(await processCampaign(db, c.id, 270));
  return NextResponse.json({ campaigns: results.length, results });
}
