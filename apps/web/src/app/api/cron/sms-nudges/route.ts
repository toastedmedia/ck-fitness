import { NextResponse, type NextRequest } from "next/server";
import { cronGuard } from "@/lib/cron";
import { sendMissedWorkoutTexts } from "@/lib/sms";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily at 18:00 UTC (10 or 11 am in Vancouver): the missed-workout text for members who turned
 * on texts in Profile. Off until the owners switch it on in Admin -> Text messages.
 */
export async function GET(request: NextRequest) {
  const denied = cronGuard(request);
  if (denied) return denied;
  return NextResponse.json(await sendMissedWorkoutTexts());
}
