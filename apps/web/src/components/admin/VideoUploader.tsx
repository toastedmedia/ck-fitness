"use client";
import { useRef, useState } from "react";

const PART = 64 * 1024 * 1024; // 64 MB slices; R2 allows up to 10,000, so files up to ~640 GB.
const PARALLEL = 3;

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/video", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json.error ?? "Something went wrong."));
  return json;
}

async function putPart(url: string, blob: Blob, tries = 3): Promise<string> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { method: "PUT", body: blob });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const etag = res.headers.get("etag");
      if (!etag) throw new Error("etag");
      return etag;
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

/** Upload, replace or remove one lesson's video. No limit on length or file size. */
export function VideoUploader({
  lessonId,
  hasVideo,
  canEdit,
}: {
  lessonId: string;
  hasVideo: boolean;
  canEdit: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [attached, setAttached] = useState(hasVideo);
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  async function upload(file: File) {
    setMsg("");
    setPct(0);
    let key = "";
    let uploadId = "";
    try {
      const s = await call({
        op: "start",
        lessonId,
        fileName: file.name,
        contentType: file.type || "video/mp4",
      });
      key = String(s.key);
      uploadId = String(s.uploadId);
      const total = Math.max(1, Math.ceil(file.size / PART));
      const parts: { partNumber: number; etag: string }[] = [];
      const sent = new Array<number>(total).fill(0);
      let next = 1;
      const worker = async () => {
        while (next <= total) {
          const n = next++;
          const blob = file.slice((n - 1) * PART, n * PART);
          const { url } = (await call({
            op: "part",
            lessonId,
            key,
            uploadId,
            partNumber: n,
          })) as { url: string };
          const etag = await putPart(url, blob);
          parts.push({ partNumber: n, etag });
          sent[n - 1] = blob.size;
          setPct(Math.round((sent.reduce((a, b) => a + b, 0) / file.size) * 100));
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL, total) }, worker));
      await call({ op: "complete", lessonId, key, uploadId, parts });
      setAttached(true);
      setMsg("Video uploaded and attached.");
    } catch (e) {
      if (key && uploadId)
        await call({ op: "abort", lessonId, key, uploadId }).catch(() => {});
      setMsg(
        `Upload stopped: ${(e as Error).message}. Check your connection and try again.`,
      );
    } finally {
      setPct(null);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setMsg("");
    try {
      await call({ op: "remove", lessonId });
      setAttached(false);
      setMsg("Video removed.");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <div className="md:col-span-2 rounded-xl border-2 border-line p-3">
      <b className="text-xs text-brand">Lesson video</b>
      <p className="mt-1 text-xs text-muted">
        {attached ? "A video is attached." : "No video yet."} Any length and any file size
        works. Use an MP4 (H.264) so it plays on every phone.
      </p>
      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/*"
            disabled={pct !== null}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
            className="text-sm"
            aria-label="Choose a video file"
          />
          {attached && pct === null ? (
            <button
              type="button"
              onClick={remove}
              className="min-h-9 rounded-xl border-2 border-danger px-3 text-xs font-bold text-danger"
            >
              Remove video
            </button>
          ) : null}
        </div>
      ) : null}
      {pct !== null ? (
        <div className="mt-2" role="status" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-page">
            <div className="h-full bg-accent-strong" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-muted">
            Uploading {pct}%. Keep this page open until it finishes.
          </span>
        </div>
      ) : null}
      {msg ? (
        <p className="mt-2 text-xs font-bold text-brand" role="status">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
