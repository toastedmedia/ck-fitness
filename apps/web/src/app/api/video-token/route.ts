import { NextResponse, type NextRequest } from "next/server";
import { canAccess, type AccessLevel, type StaffRole } from "@ck/core";
import { createServerSupabase } from "@/lib/supabase/server";
import { playbackUrl, signStreamToken } from "@/lib/stream-token";
import { resolveMembership } from "@ck/core";

export const dynamic = "force-dynamic";

/**
 * Issues a short-lived signed playback link. Two independent checks: the database only returns
 * the lesson if she may see it, and the access rule is checked again here.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

  const { lessonId, startSeconds } = (await request.json().catch(() => ({}))) as {
    lessonId?: string;
    startSeconds?: number;
  };
  if (!lessonId) return NextResponse.json({ error: "Missing lesson." }, { status: 400 });

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id,stream_uid,access_override,program_sections(programs(access_level))")
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
  if (!lesson.stream_uid)
    return NextResponse.json({ error: "This video is coming soon." }, { status: 404 });

  const keyId = process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID;
  const pem = process.env.CLOUDFLARE_STREAM_SIGNING_KEY_PEM;
  if (!keyId || !pem)
    return NextResponse.json(
      { error: "Video is not available right now." },
      { status: 503 },
    );

  const token = signStreamToken({
    videoId: lesson.stream_uid,
    keyId,
    pemBase64: pem,
    ttlSeconds: 600,
  });
  return NextResponse.json(
    { src: playbackUrl(token, Number(startSeconds) || 0) },
    { headers: { "cache-control": "no-store" } },
  );
}
