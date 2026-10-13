"use client";
import { useRef, useState } from "react";
import { announceFile } from "@/components/admin/ImagePreview";

const fmt = (t: number) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

/**
 * Staff preview of the lesson video, with a button that turns the paused frame into the lesson
 * thumbnail. The picture is placed in the thumbnail file field; press Save to keep it.
 */
export function LessonPreview({
  lessonId,
  hasVideo,
  inputId,
}: {
  lessonId: string;
  hasVideo: boolean;
  inputId: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function load() {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/admin/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "preview", lessonId }),
      });
      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !j.url) throw new Error(j.error ?? "Could not load the video.");
      setSrc(j.url);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function grab() {
    const v = video.current;
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!v || !input || !v.videoWidth) return setNote("Play the video a moment first.");
    const scale = Math.min(1, 1280 / v.videoWidth);
    const c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    try {
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
      c.toBlob(
        (b) => {
          if (!b) return setNote("Could not capture that frame.");
          const dt = new DataTransfer();
          dt.items.add(new File([b], "frame.jpg", { type: "image/jpeg" }));
          input.files = dt.files;
          announceFile(input);
          setNote(
            `Frame at ${fmt(v.currentTime)} is ready (${Math.round(b.size / 1024)} KB). Now press Save.`,
          );
        },
        "image/jpeg",
        0.85,
      );
    } catch {
      setNote("The browser blocked that frame. Check the storage CORS settings.");
    }
  }

  if (!hasVideo)
    return (
      <p className="text-xs text-muted">
        Upload a video to preview it and pick a frame as the thumbnail.
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      {src ? (
        <video
          ref={video}
          src={src}
          crossOrigin="anonymous"
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full rounded-xl bg-brand"
        />
      ) : (
        <button
          type="button"
          onClick={load}
          disabled={busy}
          className="grid aspect-video w-full place-items-center rounded-xl bg-gradient-to-br from-brand-soft to-brand text-sm font-bold text-on-brand disabled:opacity-60"
        >
          {busy ? "Loading preview..." : "Load video preview"}
        </button>
      )}
      {src ? (
        <button
          type="button"
          onClick={grab}
          className="min-h-10 self-start rounded-xl border-2 border-line px-3 text-xs font-bold text-brand"
        >
          Use this frame as the thumbnail
        </button>
      ) : null}
      {note ? (
        <p className="text-xs font-bold text-brand" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
