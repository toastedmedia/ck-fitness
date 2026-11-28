import { after, NextResponse, type NextRequest } from "next/server";
import { sendCapi } from "@/lib/meta-capi";

export const dynamic = "force-dynamic";

/** Events the browser may forward to the Meta Conversions API (anything else is ignored). */
const ALLOWED = new Set([
  "PageView",
  "ViewContent",
  "Contact",
  "Schedule",
  "Lead",
  "InitiateCheckout",
  "Purchase",
  "CompleteRegistration",
  "Login",
  "StartTraining",
  "LessonComplete",
  "Share",
]);
const OUR_SITES = /^https:\/\/(www\.|app\.)?chardikalafitness\.com(\/|$)/;

/**
 * Browser -> our server -> Meta Conversions API, with the browser's event ID so Meta keeps one copy.
 * Only from our own sites; only known event names; only a few plain fields; no personal details.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin") ?? request.headers.get("referer") ?? "";
  if (!OUR_SITES.test(origin)) return new NextResponse(null, { status: 403 });
  const b = (await request.json().catch(() => null)) as {
    event_name?: string;
    event_id?: string;
    event_source_url?: string;
    custom_data?: Record<string, unknown>;
  } | null;
  if (!b?.event_name || !ALLOWED.has(b.event_name))
    return new NextResponse(null, { status: 204 });
  const url = String(b.event_source_url ?? "");
  const custom: Record<string, string | number> = {};
  const cd = b.custom_data ?? {};
  if (typeof cd.value === "number" && cd.value >= 0 && cd.value < 10000)
    custom.value = cd.value;
  if (cd.currency === "CAD") custom.currency = "CAD";
  if (typeof cd.content_name === "string")
    custom.content_name = cd.content_name.slice(0, 100);
  if (typeof cd.training === "string") custom.content_name = cd.training.slice(0, 100);
  after(() =>
    sendCapi({
      event_name: b.event_name!,
      event_id: String(b.event_id ?? "").slice(0, 100) || undefined,
      event_source_url: OUR_SITES.test(url) ? url.slice(0, 500) : undefined,
      custom_data: custom,
    }),
  );
  return new NextResponse(null, { status: 204 });
}
