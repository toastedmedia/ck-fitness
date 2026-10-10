import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Simple uptime check. Reports only whether config is present, never values. */
export function GET() {
  return NextResponse.json({
    ok: true,
    supabaseConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  });
}
