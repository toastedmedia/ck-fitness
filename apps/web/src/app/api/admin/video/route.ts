import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/admin";
import {
  abortUpload,
  completeUpload,
  partUrl,
  playbackLink,
  r2Configured,
  r2Missing,
  releaseVideo,
  startUpload,
  videoKey,
} from "@/lib/r2";
import {
  jobConfigured,
  renditionStatus,
  setRendition,
  startRenditionJob,
} from "@/lib/hls";
import { isSameOrigin } from "@/lib/same-origin";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const err = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

/**
 * Lesson video uploads for staff. The browser sends the file straight to R2 in slices (so there is
 * no size or length limit); this route only hands out signed slice links and records the result.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return err("Not allowed.", 403);
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err("Please log in.", 401);
  const { data: roles } = await supabase
    .from("staff_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("active", true);
  if (
    !(roles ?? []).some((r: { role: string }) =>
      ["owner", "admin", "content_manager"].includes(r.role),
    )
  )
    return err("Not allowed.", 403);
  if (!r2Configured())
    return err(
      `Video storage is not connected yet. Missing in Vercel: ${r2Missing().join(", ")}. Add them for the Production environment, then redeploy.`,
      503,
    );

  const b = (await request.json().catch(() => ({}))) as {
    op?: string;
    all?: boolean;
    lessonId?: string;
    fileName?: string;
    contentType?: string;
    key?: string;
    uploadId?: string;
    partNumber?: number;
    parts?: { partNumber: number; etag: string }[];
  };
  if (!b.lessonId || !/^[0-9a-f-]{36}$/.test(b.lessonId)) return err("Missing lesson.");
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id,video_key")
    .eq("id", b.lessonId)
    .maybeSingle();
  if (!lesson) return err("Lesson not found.", 404);
  const ownKey = (k?: string) =>
    typeof k === "string" && k.startsWith(`lessons/${b.lessonId}/`);

  try {
    switch (b.op) {
      case "start": {
        if (!b.contentType?.startsWith("video/"))
          return err("Please choose a video file.");
        const key = videoKey(b.lessonId, b.fileName ?? "video");
        return NextResponse.json({
          key,
          uploadId: await startUpload(key, b.contentType),
        });
      }
      case "part": {
        const n = Number(b.partNumber);
        if (!ownKey(b.key) || !b.uploadId || !Number.isInteger(n) || n < 1 || n > 10_000)
          return err("Bad request.");
        return NextResponse.json({
          url: await partUrl(b.key as string, b.uploadId, n),
        });
      }
      case "complete": {
        if (!ownKey(b.key) || !b.uploadId || !b.parts?.length) return err("Bad request.");
        await completeUpload(b.key as string, b.uploadId, b.parts);
        const old = lesson.video_key as string | null;
        const { error } = await supabase
          .from("lessons")
          .update({ video_key: b.key })
          .eq("id", b.lessonId);
        if (error) return err("The video uploaded but could not be attached.", 500);
        if (old && old !== b.key) await releaseVideo(createAdminSupabase(), old);
        await audit(supabase, user.id, "lesson.video_attached", b.lessonId);
        // Make the streaming versions in the background (GitHub job). Until they are ready,
        // members get the original file, exactly as before.
        if (await startRenditionJob(b.key))
          await setRendition(createAdminSupabase(), b.key as string, "queued");
        return NextResponse.json({ ok: true });
      }
      case "abort": {
        if (ownKey(b.key) && b.uploadId) await abortUpload(b.key as string, b.uploadId);
        return NextResponse.json({ ok: true });
      }
      case "preview": {
        const k = lesson.video_key as string | null;
        if (!k) return err("This lesson has no video yet.", 404);
        return NextResponse.json({ url: await playbackLink(k, 3600) });
      }
      case "stream-status": {
        const k = lesson.video_key as string | null;
        return NextResponse.json({
          status: await renditionStatus(createAdminSupabase(), k),
          canStart: jobConfigured(),
        });
      }
      case "stream-start": {
        // One lesson's video, or (all: true) every video that is not ready yet.
        const all = b.all === true;
        const k = lesson.video_key as string | null;
        if (!all && !k) return err("This lesson has no video yet.", 404);
        if (!(await startRenditionJob(all ? undefined : (k as string))))
          return err(
            "Could not start the job. Check GITHUB_ACTIONS_TOKEN in Vercel, or run it from GitHub -> Actions -> Video streaming versions.",
            503,
          );
        if (!all) await setRendition(createAdminSupabase(), k as string, "queued");
        await audit(supabase, user.id, "lesson.video_stream_start", b.lessonId);
        return NextResponse.json({ ok: true });
      }
      case "remove": {
        const old = lesson.video_key as string | null;
        await supabase.from("lessons").update({ video_key: null }).eq("id", b.lessonId);
        await releaseVideo(createAdminSupabase(), old);
        await audit(supabase, user.id, "lesson.video_removed", b.lessonId);
        return NextResponse.json({ ok: true });
      }
      default:
        return err("Bad request.");
    }
  } catch (e) {
    console.error("video admin failed", b.op, (e as Error).message);
    return err("Video storage returned an error. Please try again.", 502);
  }
}
