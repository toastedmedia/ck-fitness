import { NextResponse, type NextRequest } from "next/server";
import { processAutomations } from "@/lib/automations";
import { cronGuard } from "@/lib/cron";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every 15 minutes: sends the lead automation emails that are due. */
export async function GET(request: NextRequest) {
  const denied = cronGuard(request);
  if (denied) return denied;
  return NextResponse.json(await processAutomations(createAdminSupabase()));
}
