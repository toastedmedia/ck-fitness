import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/app";
import { markLessonComplete } from "@/lib/lesson-complete";
import { isSameOrigin } from "@/lib/same-origin";

export const dynamic = "force-dynamic";

/**
 * Called when a video finishes, only for programs that have "auto-complete" switched on. Row-level
 * security still decides whether she may see the lesson at all.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  const { lessonId } = (await request.json().catch(() => ({}))) as { lessonId?: string };
  if (!lessonId) return NextResponse.json({ error: "Missing lesson." }, { status: 400 });
  const ctx = await getContext();
  const { data: lesson } = await ctx.supabase
    .from("lessons")
    .select("id,program_sections(program_id,programs(slug,auto_complete))")
    .eq("id", lessonId)
    .maybeSingle();
  const sec = lesson?.program_sections as unknown as {
    program_id: string;
    programs: { slug: string; auto_complete: boolean };
  } | null;
  if (!lesson || !sec)
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  if (!sec.programs.auto_complete)
    return NextResponse.json({ ok: true, completed: false });
  const r = await markLessonComplete(
    ctx,
    lessonId,
    sec.program_id,
    sec.programs.slug,
    "playback",
  );
  return r.ok
    ? NextResponse.json({ ok: true, completed: true })
    : NextResponse.json({ error: "Not allowed." }, { status: 403 });
}
