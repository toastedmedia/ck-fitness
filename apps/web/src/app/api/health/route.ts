import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Uptime check for monitors. Reports whether config exists and the database answers, never values. */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let database = false;
  if (url && key) {
    try {
      const res = await fetch(`${url}/rest/v1/app_settings?select=key&limit=1`, {
        headers: { apikey: key, authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });
      database = res.ok;
    } catch {
      database = false;
    }
  }
  return NextResponse.json(
    { ok: database, supabaseConfigured: Boolean(url && key), database },
    { status: database || !url ? 200 : 503 },
  );
}
