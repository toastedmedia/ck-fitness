import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Remembers where she stopped, how far she got, and how long she actually watched.
 * Row-level security rejects lessons she cannot access.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    lessonId?: string;
    seconds?: number;
    watched?: number;
    session?: boolean;
  };
  const s = Math.floor(Number(body.seconds));
  if (!body.lessonId || !Number.isFinite(s) || s < 0 || s > 86_400)
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  // Time actually spent watching since the last update. Capped so a bad client cannot inflate it.
  const watched = clamp(Math.floor(Number(body.watched) || 0), 0, 60);

  const { data: row } = await supabase
    .from("lesson_progress")
    .select("furthest_seconds,watch_seconds,play_count")
    .eq("user_id", user.id)
    .eq("lesson_id", body.lessonId)
    .maybeSingle();
  const patch = {
    playback_seconds: s,
    furthest_seconds: Math.max(row?.furthest_seconds ?? 0, s),
    watch_seconds: (row?.watch_seconds ?? 0) + watched,
    play_count: (row?.play_count ?? 0) + (body.session ? 1 : 0),
    last_watched_at: new Date().toISOString(),
  };
  const { error } = row
    ? await supabase
        .from("lesson_progress")
        .update(patch)
        .eq("user_id", user.id)
        .eq("lesson_id", body.lessonId)
    : await supabase
        .from("lesson_progress")
        .insert({ user_id: user.id, lesson_id: body.lessonId, ...patch });
  return error
    ? NextResponse.json({ error: "Not allowed." }, { status: 403 })
    : NextResponse.json({ ok: true });
}
