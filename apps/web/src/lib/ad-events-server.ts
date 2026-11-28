import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { EVENT_COOKIE, EVENT_MAP, type TrackEvent } from "@/lib/ad-tracking";
import { sendCapi } from "@/lib/meta-capi";

/**
 * Reports an ad/analytics event: hands it to the browser (Google Analytics + Meta Pixel on the next
 * page; most of our actions end in a redirect) AND sends it to the Meta Conversions API from the
 * server with the same event ID, so Meta keeps one copy. Email and user id are sent only hashed.
 * Never from inside the store app (Apple tracking rules); never health details. Never throws.
 */
export async function queueBrowserEvent(
  name: TrackEvent,
  params: Record<string, string | number> = {},
  who: { email?: string | null; userId?: string | null } = {},
): Promise<void> {
  try {
    const h = await headers();
    if ((h.get("user-agent") ?? "").includes("CKFitnessApp")) return;
    const id = randomUUID();
    const jar = await cookies();
    let list: { n: string; p: Record<string, string | number>; id?: string }[] = [];
    try {
      list = JSON.parse(jar.get(EVENT_COOKIE)?.value ?? "[]");
    } catch {
      list = [];
    }
    list.push({ n: name, p: params, id });
    jar.set(EVENT_COOKIE, JSON.stringify(list.slice(-5)), {
      path: "/",
      maxAge: 600,
      sameSite: "lax",
      secure: true,
      httpOnly: false,
    });
    const origin = h.get("origin") ?? "https://app.chardikalafitness.com";
    const m = EVENT_MAP[name];
    const custom: Record<string, string | number> = {};
    if (typeof params.training === "string") custom.content_name = params.training;
    after(() =>
      sendCapi({
        event_name: m.meta,
        event_id: id,
        event_source_url: `${origin}${h.get("referer") ? new URL(h.get("referer")!).pathname : "/"}`,
        custom_data: custom,
        email: who.email,
        external_id: who.userId,
      }),
    );
  } catch {
    /* tracking must never break the action */
  }
}
