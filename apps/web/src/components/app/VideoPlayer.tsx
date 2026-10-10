"use client";

import { useEffect, useRef, useState } from "react";

interface StreamPlayer {
  addEventListener(event: string, cb: () => void): void;
  currentTime: number;
}
declare global {
  interface Window {
    Stream?: (el: HTMLIFrameElement) => StreamPlayer;
  }
}

/**
 * Plays a lesson video. Nothing loads until she taps Play, so we only pay for minutes watched.
 * A fresh signed link is requested at that moment, and her position is saved as she watches.
 */
export function VideoPlayer({
  lessonId,
  startSeconds,
  hasVideo,
}: {
  lessonId: string;
  startSeconds: number;
  hasVideo: boolean;
}) {
  const [src, setSrc] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);

  async function play() {
    setLoading(true);
    setError(undefined);
    const res = await fetch("/api/video-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lessonId, startSeconds }),
    });
    const body = (await res.json().catch(() => ({}))) as { src?: string; error?: string };
    setLoading(false);
    if (!res.ok || !body.src)
      return setError(body.error ?? "We could not start the video. Please try again.");
    setSrc(body.src);
  }

  useEffect(() => {
    if (!src || !frame.current) return;
    const script = document.createElement("script");
    script.src = "https://embed.videodelivery.net/embed/sdk.latest.js";
    let last = 0;
    const save = (player: StreamPlayer) => {
      const s = Math.floor(player.currentTime);
      if (s > 0)
        void fetch("/api/lesson-progress", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lessonId, seconds: s }),
          keepalive: true,
        });
    };
    script.onload = () => {
      if (!window.Stream || !frame.current) return;
      const player = window.Stream(frame.current);
      player.addEventListener("timeupdate", () => {
        if (Date.now() - last > 15_000) {
          last = Date.now();
          save(player);
        }
      });
      player.addEventListener("pause", () => save(player));
    };
    document.body.appendChild(script);
    return () => script.remove();
  }, [src, lessonId]);

  if (src) {
    return (
      <div className="aspect-video overflow-hidden rounded-card bg-brand">
        <iframe
          ref={frame}
          src={src}
          title="Lesson video"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="size-full border-0"
        />
      </div>
    );
  }
  return (
    <div className="grid aspect-video place-items-center rounded-card bg-gradient-to-br from-brand-soft to-brand p-4 text-center text-on-brand">
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
  );
}
