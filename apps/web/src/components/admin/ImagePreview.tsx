/* eslint-disable @next/next/no-img-element */
"use client";
import { useEffect, useState } from "react";

/** Tell previews that a file field just received a file from code (compressing or a video frame). */
export function announceFile(input: HTMLInputElement) {
  input.dispatchEvent(new CustomEvent("ck:file-set", { bubbles: true }));
}

/**
 * Shows the saved picture, and the moment a new one is chosen, shows that instead with a
 * "not saved yet" label so it is clear what Save will keep.
 */
export function ImagePreview({
  inputId,
  currentUrl,
  empty = "No thumbnail yet",
  shape = "video",
}: {
  inputId: string;
  currentUrl: string | null;
  empty?: string;
  shape?: "video" | "wide" | "round";
}) {
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    const onSet = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (!t || t.id !== inputId) return;
      const f = t.files?.[0];
      if (url) URL.revokeObjectURL(url);
      url = f ? URL.createObjectURL(f) : null;
      setFresh(url);
    };
    document.addEventListener("ck:file-set", onSet);
    return () => {
      document.removeEventListener("ck:file-set", onSet);
      if (url) URL.revokeObjectURL(url);
    };
  }, [inputId]);

  const box =
    shape === "round"
      ? "size-24 rounded-full"
      : shape === "wide"
        ? "aspect-[16/8] w-full rounded-xl"
        : "aspect-video w-full rounded-xl";
  const src = fresh ?? currentUrl;
  return (
    <div className="relative">
      {src ? (
        <img
          src={src}
          alt={fresh ? "New image, not saved yet" : "Current image"}
          className={`${box} object-cover`}
        />
      ) : (
        <span
          className={`${box} grid place-items-center border border-dashed border-line text-xs font-normal text-muted`}
        >
          {empty}
        </span>
      )}
      {fresh ? (
        <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent">
          New. Press Save to keep it
        </span>
      ) : null}
    </div>
  );
}
