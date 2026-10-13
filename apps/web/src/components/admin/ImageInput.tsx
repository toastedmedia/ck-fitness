"use client";
import { useState } from "react";
import { compressPhoto } from "@/lib/image-compress";
import { FilePick } from "@/components/admin/FilePick";
import { announceFile } from "@/components/admin/ImagePreview";

/**
 * A file picker for cover images and thumbnails. Big phone photos are shrunk in the browser before
 * saving (a few hundred KB instead of many MB), so saving is fast and never hits upload limits.
 */
export function ImageInput({ name, id }: { name: string; id?: string }) {
  const [note, setNote] = useState("");

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return setNote("");
    setNote("Preparing the image...");
    try {
      const blob = await compressPhoto(file, 1600, 0.85);
      const base = file.name.replace(/\.[^.]+$/, "") || "image";
      const out = new File([blob], `${base}.jpg`, { type: "image/jpeg" });
      const dt = new DataTransfer();
      dt.items.add(out);
      input.files = dt.files;
      announceFile(input);
      setNote(`Ready (${Math.max(1, Math.round(out.size / 1024))} KB). Now save.`);
    } catch {
      input.value = "";
      announceFile(input);
      setNote("We could not read that image. Please choose a JPG or PNG.");
    }
  }

  return (
    <>
      <FilePick
        id={id}
        name={name}
        accept="image/jpeg,image/png,image/webp"
        label="Choose image"
        showName={false}
        onChange={onChange}
      />
      {note ? (
        <span className="text-xs font-normal text-muted" role="status">
          {note}
        </span>
      ) : null}
    </>
  );
}
