import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { META_PIXEL_ID } from "@/lib/ad-tracking";

/**
 * Meta Conversions API: sends the same events as the browser Pixel from our server, with the same
 * event ID so Meta counts each action once. Works around ad blockers and iPhone Safari limits.
 * Needs META_CAPI_TOKEN in Vercel (Events Manager -> the "Chardikala Fitness" dataset -> Settings ->
 * Conversions API -> Generate access token). Without it nothing is sent. Optional
 * META_CAPI_TEST_CODE shows events under "Test events" while checking. Never throws.
 */
export function capiConfigured(): boolean {
  return (
    Boolean(process.env.META_CAPI_TOKEN) &&
    Boolean(META_PIXEL_ID) &&
    META_PIXEL_ID !== "off"
  );
}

const sha = (v: string) =>
  createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

export interface CapiEvent {
  event_name: string;
  event_id?: string;
  event_source_url?: string;
  custom_data?: Record<string, string | number>;
  /** Sent hashed (SHA-256), never in plain text. */
  email?: string | null;
  /** Our user id, sent hashed, to match the same person across visits. */
  external_id?: string | null;
}

/** Browser details for matching: IP, user agent and Meta's _fbp/_fbc cookies (or ?fbclid). */
export async function requestUserData(sourceUrl?: string) {
  const h = await headers();
  const c = await cookies();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || undefined;
  let fbc = c.get("_fbc")?.value;
  if (!fbc && sourceUrl) {
    try {
      const id = new URL(sourceUrl).searchParams.get("fbclid");
      if (id) fbc = `fb.1.${Date.now()}.${id}`;
    } catch {
      /* not a URL */
    }
  }
  return {
    client_ip_address: ip,
    client_user_agent: h.get("user-agent") ?? undefined,
    fbp: c.get("_fbp")?.value,
    fbc,
  };
}

export async function sendCapi(e: CapiEvent): Promise<boolean> {
  if (!capiConfigured()) return false;
  try {
    const ua = await requestUserData(e.event_source_url);
    if ((ua.client_user_agent ?? "").includes("CKFitnessApp")) return false; // never from the store app
    const body = {
      data: [
        {
          event_name: e.event_name,
          event_time: Math.floor(Date.now() / 1000),
          event_id: e.event_id ?? randomUUID(),
          action_source: "website",
          ...(e.event_source_url ? { event_source_url: e.event_source_url } : {}),
          user_data: {
            ...ua,
            ...(e.email ? { em: [sha(e.email)] } : {}),
            ...(e.external_id ? { external_id: [sha(e.external_id)] } : {}),
          },
          ...(e.custom_data && Object.keys(e.custom_data).length
            ? { custom_data: e.custom_data }
            : {}),
        },
      ],
      ...(process.env.META_CAPI_TEST_CODE
        ? { test_event_code: process.env.META_CAPI_TEST_CODE }
        : {}),
    };
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${encodeURIComponent(process.env.META_CAPI_TOKEN!)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok)
      console.error("meta capi failed", res.status, (await res.text()).slice(0, 200));
    return res.ok;
  } catch (err) {
    console.error("meta capi failed", (err as Error).message);
    return false;
  }
}
