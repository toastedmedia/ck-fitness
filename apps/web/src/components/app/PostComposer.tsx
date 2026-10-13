"use client";

import { useEffect, useState, useTransition } from "react";
import { CATEGORIES, MAX_IMAGES, MAX_PHOTO_BYTES, photoPath } from "@ck/core";
import { createPost } from "@/app/(app)/community/actions";
import { compressPhoto } from "@/lib/image-compress";
import { createBrowserSupabase } from "@/lib/supabase/browser";

/** Write a post, optionally with up to four photos. Photos are shrunk on the phone, then uploaded privately. */
export function PostComposer({
  userId,
  approvalOn,
}: {
  userId: string;
  approvalOn: boolean;
}) {
  const [category, setCategory] = useState<string>("win");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [busy, start] = useTransition();

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const submit = () =>
    start(async () => {
      setError(undefined);
      const uploaded: string[] = [];
      const supabase = createBrowserSupabase();
      try {
        for (const f of files) {
          const blob = await compressPhoto(f);
          if (blob.size > MAX_PHOTO_BYTES)
            throw new Error("A photo is too large. Please choose another.");
          const path = photoPath(userId, crypto.randomUUID());
          const { error: e } = await supabase.storage
            .from("community-media")
            .upload(path, blob, { contentType: "image/jpeg" });
          if (e) throw new Error("We could not upload a photo. Please try again.");
          uploaded.push(path);
        }
        const fd = new FormData();
        fd.set("category", category);
        fd.set("body", body);
        fd.set("images", JSON.stringify(uploaded));
        await createPost(fd); // redirects on success
      } catch (e) {
        // A redirect from the server action is not an error.
        if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
        if (uploaded.length)
          await supabase.storage.from("community-media").remove(uploaded);
        setError((e as Error).message || "That could not be posted. Please try again.");
      }
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Post type">
        {CATEGORIES.map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={category === v}
            onClick={() => setCategory(v)}
            className={`min-h-9 rounded-chip border-2 px-3 text-xs font-bold ${category === v ? "border-brand bg-brand text-on-brand" : "border-line bg-surface"}`}
          >
            {l}
          </button>
        ))}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={1000}
        aria-label="Your post"
        placeholder="Share a win, ask a question or offer a tip..."
        className="w-full rounded-2xl border-2 border-line bg-surface p-3 text-sm"
      />
      {previews.length ? (
        <ul className="grid grid-cols-4 gap-2">
          {previews.map((u, i) => (
            <li key={u} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={u}
                alt={`Photo ${i + 1}`}
                className="aspect-square w-full rounded-xl object-cover"
              />
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => setFiles((f) => f.filter((_, n) => n !== i))}
                className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-brand text-xs text-on-brand"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <label
          className={`inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-button border-2 border-line px-3 text-xs font-bold text-brand ${files.length >= MAX_IMAGES ? "pointer-events-none opacity-50" : ""}`}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4 fill-none stroke-current"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <circle cx="9" cy="11" r="2" />
            <path d="M21 16l-5-4-7 6" />
          </svg>
          Add photos
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              setFiles((f) => [...f, ...list].slice(0, MAX_IMAGES));
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy || !body.trim()}
          onClick={submit}
          className="min-h-11 rounded-button bg-brand px-6 text-xs font-bold text-on-brand disabled:opacity-50"
        >
          {busy ? "Posting..." : "Post"}
        </button>
      </div>
      <p className="text-[10.5px] text-muted">
        No links or medical advice. Be kind.
        {approvalOn && files.length
          ? " Posts with photos are checked by our team before they appear."
          : ""}
      </p>
      {error ? (
        <p role="alert" className="text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
