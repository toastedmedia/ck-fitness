import { NextResponse, type NextRequest } from "next/server";
import {
  hlsPrefix,
  playlistUris,
  rewritePlaylist,
  safeHlsFile,
  variantOf,
} from "@ck/core";
import { playlistPath, verifyPass } from "@/lib/hls";
import { playbackLink, r2Configured, readText } from "@/lib/r2";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const deny = (status = 403) => new NextResponse("Not allowed.", { status });

/**
 * Streaming playlists for one lesson. `master.m3u8` lists the qualities (each pointing back here);
 * `v0.m3u8`, `v1.m3u8`... list that quality's 6-second pieces as signed storage links. Access was
 * checked in /api/video-token, which issued the pass in `?t=`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string; file: string }> },
) {
  const { lessonId, file } = await params;
  if (!/^[0-9a-f-]{36}$/.test(lessonId)) return deny(404);
  const pass = request.nextUrl.searchParams.get("t");
  if (!verifyPass(lessonId, pass)) return deny();
  if (!r2Configured()) return deny(503);

  const name =
    file === "master.m3u8"
      ? "master.m3u8"
      : safeHlsFile(`${file.replace(/\.m3u8$/, "")}/index.m3u8`);
  if (!name) return deny(404);

  const { data: lesson } = await createAdminSupabase()
    .from("lessons")
    .select("video_key")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson?.video_key) return deny(404);
  const folder = hlsPrefix(lesson.video_key as string);
  const text = await readText(`${folder}/${name}`).catch(() => null);
  if (text === null) return deny(404);

  let body: string;
  if (name === "master.m3u8") {
    body = rewritePlaylist(text, (u) => {
      const v = variantOf(u);
      return v ? playlistPath(lessonId, `${v}.m3u8`, pass as string) : u;
    });
  } else {
    // Pieces: one signed storage link each, valid as long as the pass.
    const dir = name.slice(0, name.indexOf("/"));
    const links = new Map<string, string>();
    await Promise.all(
      playlistUris(text).map(async (u) => {
        if (safeHlsFile(`${dir}/${u}`))
          links.set(u, await playbackLink(`${folder}/${dir}/${u}`));
      }),
    );
    body = rewritePlaylist(text, (u) => links.get(u) ?? u);
  }
  return new NextResponse(body, {
    headers: {
      "content-type": "application/vnd.apple.mpegurl",
      "cache-control": "private, no-store",
    },
  });
}
