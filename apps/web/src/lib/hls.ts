import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { RenditionStatus } from "@ck/core";

/**
 * Streaming (HLS) playback. After the access check in /api/video-token, the player gets a link to
 * our playlist route carrying a signed pass for that one lesson. Phones and TVs fetch playlists
 * without the member's sign-in cookie (the iPhone video player does not send it), so the pass is
 * what lets them in. It expires with the same 6 hours as the plain video link.
 */
const secret = () => process.env.CRON_SECRET ?? "";
export const PASS_SECONDS = 6 * 3600;

const mac = (lessonId: string, exp: number) =>
  createHmac("sha256", secret()).update(`hls:${lessonId}:${exp}`).digest("base64url");

export function signPass(lessonId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + PASS_SECONDS;
  return `${exp}.${mac(lessonId, exp)}`;
}

export function verifyPass(lessonId: string, pass: string | null, now = Date.now()) {
  if (!pass || !secret()) return false;
  const [e, given] = pass.split(".");
  const exp = Number(e);
  if (!Number.isInteger(exp) || exp * 1000 < now || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(mac(lessonId, exp));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The playlist link the player opens. */
export const playlistPath = (lessonId: string, file: string, pass: string) =>
  `/api/hls/${lessonId}/${file}?t=${encodeURIComponent(pass)}`;

type Db = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Streaming status of one video file, or null when unknown (or migration 0029 not run yet). */
export async function renditionStatus(
  db: Db,
  videoKey: string | null | undefined,
): Promise<RenditionStatus | null> {
  if (!videoKey) return null;
  const { data, error } = await db
    .from("video_renditions")
    .select("status")
    .eq("video_key", videoKey)
    .maybeSingle();
  if (error) return null;
  return (data?.status as RenditionStatus | undefined) ?? null;
}

export async function setRendition(
  db: Db,
  videoKey: string,
  status: RenditionStatus,
  error: string | null = null,
) {
  const { error: e } = await db
    .from("video_renditions")
    .upsert({ video_key: videoKey, status, error, updated_at: new Date().toISOString() });
  if (e) console.error("video_renditions", e.message);
}

/** True when the app can start the GitHub job by itself (otherwise owners run it by hand). */
export const jobConfigured = () => Boolean(process.env.GITHUB_ACTIONS_TOKEN);

/**
 * Starts the "Video streaming versions" GitHub job for one video, or (no key) for every video that
 * is not ready yet. Needs GITHUB_ACTIONS_TOKEN: a fine-grained token for the repository with
 * "Actions: Read and write". Never throws: the plain video keeps working if this fails.
 */
export async function startRenditionJob(videoKey?: string): Promise<boolean> {
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) return false;
  const repo = process.env.GITHUB_REPO ?? "toastedmedia/ck-fitness";
  try {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/video-hls.yml/dispatches`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main", inputs: { video_key: videoKey ?? "" } }),
      },
    );
    if (!res.ok) console.error("video job", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("video job", (e as Error).message);
    return false;
  }
}
