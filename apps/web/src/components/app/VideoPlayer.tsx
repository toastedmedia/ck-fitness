/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Plays a lesson video. Nothing loads until she taps Play, so nothing is fetched unless it is
 * watched. A fresh signed link is requested at that moment, and her position is saved as she watches.
 */
export function VideoPlayer({
  lessonId,
  startSeconds,
  hasVideo,
  poster,
}: {
  lessonId: string;
  startSeconds: number;
  hasVideo: boolean;
  poster?: string | null;
}) {
  const [src, setSrc] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  async function play() {
    setLoading(true);
    setError(undefined);
    const res = await fetch("/api/video-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lessonId }),
    });
    const body = (await res.json().catch(() => ({}))) as { src?: string; error?: string };
    setLoading(false);
    if (!res.ok || !body.src)
      return setError(body.error ?? "We could not start the video. Please try again.");
    setSrc(body.src);
  }

  useEffect(() => {
    const el = video.current;
    if (!src || !el) return;
    let lastSent = 0;
    let lastTime = -1;
    let pending = 0; // seconds genuinely watched since the last update
    let firstUpdate = true;
    const send = () => {
      const seconds = Math.floor(el.currentTime);
      if (seconds <= 0 && pending === 0) return;
      const watched = Math.round(pending);
      pending = 0;
      void fetch("/api/lesson-progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lessonId, seconds, watched, session: firstUpdate }),
        keepalive: true,
      });
      firstUpdate = false;
    };
    const onMeta = () => {
      if (startSeconds > 5 && el.duration > startSeconds + 5)
        el.currentTime = startSeconds;
      void el.play().catch(() => undefined);
    };
    const onTime = () => {
      const t = el.currentTime;
      // Count normal playback only (small forward steps); skipping ahead is not "watching".
      if (lastTime >= 0 && t > lastTime && t - lastTime < 2.5) pending += t - lastTime;
      lastTime = t;
      if (Date.now() - lastSent > 15_000) {
        lastSent = Date.now();
        send();
      }
    };
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("pause", send);
    el.addEventListener("ended", send);
    return () => {
      send();
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("pause", send);
      el.removeEventListener("ended", send);
    };
  }, [src, lessonId, startSeconds]);

  if (src) {
    return (
      <div className="aspect-video overflow-hidden rounded-card bg-brand">
        <video
          ref={video}
          src={src}
          poster={poster ?? undefined}
          controls
          playsInline
          preload="metadata"
          controlsList="nodownload"
          className="size-full"
        >
          Your browser cannot play this video.
        </video>
      </div>
    );
  }
  return (
    <div className="relative grid aspect-video place-items-center overflow-hidden rounded-card bg-gradient-to-br from-brand-soft to-brand p-4 text-center text-on-brand">
      {poster ? (
        <img src={poster} alt="" className="absolute inset-0 size-full object-cover" />
      ) : null}
      {poster ? (
        <div className="absolute inset-0 bg-brand/40" aria-hidden="true" />
      ) : null}
      <div className="relative">
        {hasVideo ? (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={play}
              disabled={loading}
              aria-label="Play video"
              className="grid size-14 place-items-center rounded-full bg-surface text-brand disabled:opacity-60"
            >
              <svg viewBox="0 0 24 24" className="size-6 fill-current" aria-hidden="true">
                <path d="M8 5l11 7-11 7z" />
              </svg>
            </button>
            <span className="text-xs">
              {loading
                ? "Getting your video ready..."
                : startSeconds > 5
                  ? "Tap to resume"
                  : "Tap to play"}
            </span>
            {error ? (
              <span role="alert" className="text-xs font-semibold text-accent">
                {error}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-xs">Video coming soon. The written steps are below.</span>
        )}
      </div>
    </div>
  );
}
