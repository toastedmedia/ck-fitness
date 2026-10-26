"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_PHOTO_BYTES, photoPath, POSES, type Pose } from "@ck/core";
import { recordPhoto } from "@/app/(app)/progress/photos/actions";
import { compressPhoto } from "@/lib/image-compress";
import { createBrowserSupabase } from "@/lib/supabase/browser";

/** Picks up to four photos, shrinks them on her phone, and uploads them. */
export function PhotoUploader({
  userId,
  afterSaveHref,
}: {
  userId: string;
  afterSaveHref?: string;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<Partial<Record<Pose, File>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string }>();
  const chosen = Object.keys(files).length;

  async function save() {
    setBusy(true);
    setMessage(undefined);
    const supabase = createBrowserSupabase();
    let saved = 0;
    try {
      for (const [pose, file] of Object.entries(files) as [Pose, File][]) {
        const blob = await compressPhoto(file);
        if (blob.size > MAX_PHOTO_BYTES)
          throw new Error("A photo is too large. Please try another.");
        const path = photoPath(userId, crypto.randomUUID());
        const { error } = await supabase.storage
          .from("progress-photos")
          .upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (error) throw new Error("We could not upload a photo. Please try again.");
        const r = await recordPhoto(pose, path);
        if (r.error) {
          await supabase.storage.from("progress-photos").remove([path]);
          throw new Error(r.error);
        }
        saved++;
      }
      setFiles({});
      setMessage({
        tone: "ok",
        text: `Saved ${saved} photo${saved === 1 ? "" : "s"}.`,
      });
      if (afterSaveHref) router.push(afterSaveHref);
    } catch (e) {
      setMessage({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {POSES.map(([pose, label]) => (
          <label
            key={pose}
            className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed border-line bg-surface p-2 text-center text-xs font-bold text-brand"
          >
            {label}
            <span className="font-normal text-muted">
              {files[pose] ? files[pose]!.name.slice(0, 18) : "Tap to choose"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFiles((s) => ({ ...s, [pose]: f }));
              }}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={busy || chosen === 0}
        onClick={save}
        className="min-h-12 rounded-button bg-brand text-sm font-bold text-on-brand disabled:opacity-50"
      >
        {busy
          ? "Saving..."
          : `Save ${chosen || ""} photo${chosen === 1 ? "" : "s"}`.replace("  ", " ")}
      </button>
      {message ? (
        <p
          role={message.tone === "bad" ? "alert" : "status"}
          className={`text-xs font-semibold ${message.tone === "bad" ? "text-danger" : "text-success"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
