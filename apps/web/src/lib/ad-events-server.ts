import "server-only";
import { cookies, headers } from "next/headers";
import { EVENT_COOKIE, type TrackEvent } from "@/lib/ad-tracking";

/**
 * Hands an ad/analytics event to the browser, which sends it to Google Analytics and the Meta Pixel
 * on the next page it shows (most of our actions end in a redirect). Never sent from inside the
 * store app (Apple tracking rules), never includes personal or health details. Never throws.
 */
export async function queueBrowserEvent(
  name: TrackEvent,
  params: Record<string, string | number> = {},
): Promise<void> {
  try {
    if (((await headers()).get("user-agent") ?? "").includes("CKFitnessApp")) return;
    const jar = await cookies();
    let list: { n: string; p: Record<string, string | number> }[] = [];
    try {
      list = JSON.parse(jar.get(EVENT_COOKIE)?.value ?? "[]");
    } catch {
      list = [];
    }
    list.push({ n: name, p: params });
    jar.set(EVENT_COOKIE, JSON.stringify(list.slice(-5)), {
      path: "/",
      maxAge: 600,
      sameSite: "lax",
      secure: true,
      httpOnly: false,
    });
  } catch {
    /* tracking must never break the action */
  }
}
