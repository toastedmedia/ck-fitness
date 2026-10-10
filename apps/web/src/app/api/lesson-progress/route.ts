import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Remembers where she stopped watching. Row-level security rejects lessons she cannot access. */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { lessonId, seconds } = (await request.json().catch(() => ({}))) as {
    lessonId?: string;
    seconds?: number;
  };
  const s = Math.floor(Number(seconds));
  if (!lessonId || !Number.isFinite(s) || s < 0 || s > 86_400)
    return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const { data: row } = await supabase
    .from("lesson_progress")
    .select("lesson_id")
    .eq("user_id", user.id)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  const { error } = row
    ? await supabase
        .from("lesson_progress")
        .update({ playback_seconds: s })
        .eq("user_id", user.id)
        .eq("lesson_id", lessonId)
    : await supabase
        .from("lesson_progress")
        .insert({ user_id: user.id, lesson_id: lessonId, playback_seconds: s });
  return error
    ? NextResponse.json({ error: "Not allowed." }, { status: 403 })
    : NextResponse.json({ ok: true });
}
