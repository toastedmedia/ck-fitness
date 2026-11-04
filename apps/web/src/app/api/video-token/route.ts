import { NextResponse, type NextRequest } from "next/server";
import { canAccess, type AccessLevel, type StaffRole } from "@ck/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { playlistPath, renditionStatus, signPass } from "@/lib/hls";
import { playbackLink, r2Configured } from "@/lib/r2";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { resolveMembership } from "@ck/core";

export const dynamic = "force-dynamic";

/**
 * Issues the playback links: `hls` (streaming in several qualities, when its versions are ready)
 * and `src` (the original file, used until then and as the fallback). Issues a signed playback link (good for one long session; R2 charges nothing for viewing). Two independent checks: the database only returns
 * the lesson if she may see it, and the access rule is checked again here.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const { lessonId } = (await request.json().catch(() => ({}))) as {
    lessonId?: string;
  };
  if (!lessonId) return NextResponse.json({ error: "Missing lesson." }, { status: 400 });

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id,video_key,access_override,program_sections(programs(access_level))")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson)
    return NextResponse.json({ error: "This video is for members." }, { status: 403 });

  const programLevel =
    (
      lesson.program_sections as unknown as {
        programs: { access_level: AccessLevel };
      } | null
    )?.programs.access_level ?? "member";
  const level = (lesson.access_override ?? programLevel) as AccessLevel;
  const [{ data: m }, { data: roles }] = await Promise.all([
    supabase
      .from("memberships")
      .select("entitlement,status,period_end,cancel_at_period_end")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("staff_roles").select("role").eq("user_id", user.id).eq("active", true),
  ]);
  const viewer = {
    entitlement: resolveMembership(m).entitlement,
    staffRoles: ((roles ?? []) as { role: StaffRole }[]).map((r) => r.role),
  };
  if (!canAccess(viewer, level))
    return NextResponse.json({ error: "This video is for members." }, { status: 403 });
  if (!lesson.video_key)
    return NextResponse.json({ error: "This video is coming soon." }, { status: 404 });
  if (!r2Configured())
    return NextResponse.json(
      { error: "Video is not available right now." },
      { status: 503 },
    );
  const ready =
    (await renditionStatus(createAdminSupabase(), lesson.video_key)) === "ready";
  return NextResponse.json(
    {
      src: await playbackLink(lesson.video_key),
      hls: ready
        ? playlistPath(lesson.id, "master.m3u8", signPass(lesson.id))
        : undefined,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
