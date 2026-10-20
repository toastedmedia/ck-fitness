"use client";
import { useRef, useState } from "react";
import { FilePick } from "@/components/admin/FilePick";

const PART = 32 * 1024 * 1024; // 32 MB slices: small enough to retry quickly, R2 allows 10,000 (320 GB).
const PARALLEL = 3;
const PART_TIMEOUT_MS = 5 * 60 * 1000;

type Saved = {
  key: string;
  uploadId: string;
  parts: { partNumber: number; etag: string }[];
};
const savedKey = (lessonId: string, f: File) =>
  `ck-video:${lessonId}:${f.name}:${f.size}:${f.lastModified}`;
const loadSaved = (k: string): Saved | null => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
};
const store = (k: string, v: Saved | null) => {
  try {
    if (v) localStorage.setItem(k, JSON.stringify(v));
    else localStorage.removeItem(k);
  } catch {
    /* resume just will not be available */
  }
};

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

async function putPart(url: string, blob: Blob, tries = 5): Promise<string> {
  for (let i = 1; ; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PART_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "PUT",
        body: blob,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const etag = res.headers.get("etag");
      if (!etag)
        throw new Error(
          "the storage did not return a receipt (check the R2 CORS setting)",
        );
      return etag;
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    } finally {
      clearTimeout(timer);
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
    const sk = savedKey(lessonId, file);
    let saved = loadSaved(sk);
    let failedPart = 0;
    try {
      if (!saved) {
        const st = await call({
          op: "start",
          lessonId,
          fileName: file.name,
          contentType: file.type || "video/mp4",
        });
        saved = { key: String(st.key), uploadId: String(st.uploadId), parts: [] };
        store(sk, saved);
      }
      const { key, uploadId } = saved;
      const total = Math.max(1, Math.ceil(file.size / PART));
      const done = new Map(saved.parts.map((p) => [p.partNumber, p.etag]));
      const sizeOf = (n: number) => Math.min(PART, file.size - (n - 1) * PART);
      const sentBytes = () => [...done.keys()].reduce((a, n) => a + sizeOf(n), 0);
      setPct(Math.round((sentBytes() / file.size) * 100));
      let next = 1;
      const worker = async () => {
        while (next <= total) {
          const n = next++;
          if (done.has(n)) continue;
          failedPart = n;
          const blob = file.slice((n - 1) * PART, n * PART);
          const { url } = (await call({
            op: "part",
            lessonId,
            key,
            uploadId,
            partNumber: n,
          })) as { url: string };
          const etag = await putPart(url, blob);
          done.set(n, etag);
          saved = {
            key,
            uploadId,
            parts: [...done.entries()].map(([partNumber, e]) => ({
              partNumber,
              etag: e,
            })),
          };
          store(sk, saved);
          setPct(Math.round((sentBytes() / file.size) * 100));
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL, total) }, worker));
      await call({
        op: "complete",
        lessonId,
        key,
        uploadId,
        parts: [...done.entries()]
          .map(([partNumber, etag]) => ({ partNumber, etag }))
          .sort((a, b) => a.partNumber - b.partNumber),
      });
      store(sk, null);
      setAttached(true);
      setMsg("Video uploaded and attached.");
    } catch (e) {
      const why = (e as Error).message;
      // An upload the storage no longer knows about cannot be resumed: forget it so the next try starts fresh.
      if (/NoSuchUpload|not exist|expired/i.test(why)) store(sk, null);
      // Keep what already arrived: choosing the same file again continues from there.
      setMsg(
        `Upload paused${failedPart ? ` (piece ${failedPart})` : ""}: ${why}. ${
          navigator.onLine === false ? "Your internet is offline. " : ""
        }Choose the same file again and it continues where it stopped.`,
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
        works. Use an MP4 (H.264) so it plays on every phone. Big files upload in pieces;
        if it pauses, choose the same file again and it continues. Keep this page open and
        the computer awake. Tip: a 1080p export is usually 200 to 500 MB, much faster to
        upload and to start playing on members&apos; phones.
      </p>
      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <FilePick
            inputRef={input}
            accept="video/mp4,video/quicktime,video/webm,video/*"
            label={attached ? "Replace video" : "Choose video"}
            disabled={pct !== null}
            showName={false}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
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
