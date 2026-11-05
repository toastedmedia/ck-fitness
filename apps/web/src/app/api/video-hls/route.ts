import { NextResponse, type NextRequest } from "next/server";
import { needsRendition, type RenditionStatus } from "@ck/core";
import { setRendition } from "@/lib/hls";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Only the "Video streaming versions" GitHub job may call this. It uses its own secret,
 * VIDEO_JOB_SECRET (same value in Vercel and in GitHub), so it never needs CRON_SECRET.
 */
function allowed(request: NextRequest) {
  const s = process.env.VIDEO_JOB_SECRET;
  return Boolean(s) && request.headers.get("authorization") === `Bearer ${s}`;
}

/** Videos that still need streaming versions (the job's "prepare everything" list). */
export async function GET(request: NextRequest) {
  if (!allowed(request))
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const db = createAdminSupabase();
  const [{ data: lessons }, { data: rows, error }] = await Promise.all([
    db.from("lessons").select("video_key").not("video_key", "is", null),
    db.from("video_renditions").select("video_key,status,updated_at"),
  ]);
  if (error) return NextResponse.json({ error: "Run SQL 0029 first." }, { status: 503 });
  const known = new Map(
    (rows ?? []).map((r) => [
      r.video_key as string,
      r as { status: RenditionStatus; updated_at: string },
    ]),
  );
  const keys = [...new Set((lessons ?? []).map((l) => l.video_key as string))]
    .filter((k) => needsRendition(known.get(k)))
    // GitHub runs at most 256 jobs per run; the rest are picked up by the next run.
    .slice(0, 200);
  // Mark them so a second run started meanwhile does not do the same work.
  for (const k of keys) await setRendition(db, k, "queued");
  return NextResponse.json({ keys });
}

/** The job reports progress: processing, ready or failed. */
export async function POST(request: NextRequest) {
  if (!allowed(request))
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as {
    videoKey?: string;
    status?: string;
    error?: string;
  };
  const statuses: RenditionStatus[] = ["processing", "ready", "failed"];
  if (
    !b.videoKey ||
    !/^lessons\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/.test(b.videoKey) ||
    !statuses.includes(b.status as RenditionStatus)
  )
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  await setRendition(
    createAdminSupabase(),
    b.videoKey,
    b.status as RenditionStatus,
    b.error?.slice(0, 300) || null,
  );
  return NextResponse.json({ ok: true });
}
