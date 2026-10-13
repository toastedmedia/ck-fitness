import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/admin";
import {
  abortUpload,
  completeUpload,
  partUrl,
  r2Configured,
  releaseVideo,
  startUpload,
  videoKey,
} from "@/lib/r2";
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
  if (!r2Configured()) return err("Video storage is not connected yet.", 503);

  const b = (await request.json().catch(() => ({}))) as {
    op?: string;
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
        return NextResponse.json({ ok: true });
      }
      case "abort": {
        if (ownKey(b.key) && b.uploadId) await abortUpload(b.key as string, b.uploadId);
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
