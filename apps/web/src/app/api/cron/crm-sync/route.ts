import { NextResponse, type NextRequest } from "next/server";
import { processCrmQueue } from "@/lib/crm";
import { cronGuard } from "@/lib/cron";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = cronGuard(request);
  if (denied) return denied;
  return NextResponse.json(await processCrmQueue());
}
