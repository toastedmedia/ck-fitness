import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/same-origin";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
