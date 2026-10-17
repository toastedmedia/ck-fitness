"use client";
import { useRef, useState } from "react";
import { ESTIMATE_FROM_PHOTO, MAX_PHOTO_BYTES, photoPath } from "@ck/core";
import { Button, Cap, Card, Flash } from "@/components/app/ui";
import {
  MealEditor,
  type EditorInitial,
  type EditorItem,
} from "@/components/nutrition/MealEditor";
import { compressPhoto } from "@/lib/image-compress";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { saveMeal, scanMeal } from "@/app/(app)/nutrition/actions";

type Stage = "start" | "working" | "review" | "manual";

const input =
  "mt-1 min-h-11 w-full rounded-2xl border-2 border-line bg-surface px-3 text-sm font-normal";

/**
 * Log a meal: take or choose a photo, describe it, or add it by hand. The AI result is only ever a
 * starting point; nothing is saved until the member confirms.
 */
export function ScanFlow({
  userId,
  base,
  aiAvailable,
}: {
  userId: string;
  base: Omit<EditorInitial, "items">;
  aiAvailable: boolean;
}) {
  const [stage, setStage] = useState<Stage>("start");
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [path, setPath] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [initial, setInitial] = useState<EditorInitial | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const cam = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);

  async function discardPhoto(p = path) {
    if (!p) return;
    try {
      await createBrowserSupabase().storage.from("meal-photos").remove([p]);
    } catch {
      /* the cleanup job removes strays */
    }
    setPath("");
  }

  async function run(file: File | null) {
    setError("");
    setStage("working");
    let uploaded = "";
    try {
      if (file) {
        const blob = await compressPhoto(file, 1280, 0.8);
        if (blob.size > MAX_PHOTO_BYTES)
          throw new Error("That photo is too large. Please try another.");
        uploaded = photoPath(userId, crypto.randomUUID());
        const { error: upErr } = await createBrowserSupabase()
          .storage.from("meal-photos")
          .upload(uploaded, blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw new Error("We could not upload the photo. Please try again.");
        setPath(uploaded);
        setPreview(URL.createObjectURL(blob));
      }
      const r = await scanMeal({
        photoPath: uploaded || undefined,
        description: text,
        mealType: base.mealType,
      });
      if (!r.ok) {
        if (uploaded) await discardPhoto(uploaded);
        setPreview(null);
        setError(r.error);
        setStage("start");
        return;
      }
      setLeft(r.scansLeft);
      const items: EditorItem[] = r.items.map((i) => ({
        name: i.name,
        serving: i.serving,
        calories: String(i.calories),
        protein: String(i.protein),
        carbs: String(i.carbs),
        fat: String(i.fat),
        confidence: i.confidence,
        ai: { calories: i.calories, protein: i.protein, carbs: i.carbs, fat: i.fat },
      }));
      setInitial({
        ...base,
        description: text || base.description,
        items,
        photoPath: uploaded || undefined,
        aiEstimated: true,
        aiModel: r.model,
        aiNotes: r.notes.join(" "),
      });
      setStage("review");
    } catch (e) {
      if (uploaded) await discardPhoto(uploaded);
      setPreview(null);
      setError((e as Error).message || "Something went wrong. Please try again.");
      setStage("start");
    }
  }

  function reset() {
    discardPhoto();
    setPreview(null);
    setInitial(null);
    setStage("start");
  }

  if (stage === "working")
    return (
      <Card className="text-center">
        <p role="status" className="text-sm font-bold text-brand">
          Estimating your meal…
        </p>
        <p className="mt-1 text-xs text-muted">This usually takes a few seconds.</p>
      </Card>
    );

  if (stage === "review" && initial)
    return (
      <>
        <p className="text-xs text-muted">{ESTIMATE_FROM_PHOTO}</p>
        <MealEditor
          action={saveMeal}
          confirmLabel="Confirm meal"
          initial={{ ...initial, photoUrl: preview }}
        />
        <Button type="button" variant="ghost" onClick={reset}>
          Scan again
        </Button>
        {left !== null ? (
          <p className="text-center text-[11px] text-muted">
            {left} AI scans left today.
          </p>
        ) : null}
      </>
    );

  if (stage === "manual")
    return (
      <>
        <MealEditor
          action={saveMeal}
          confirmLabel="Save meal"
          initial={{ ...base, description: text || base.description, items: [] }}
        />
        <Button type="button" variant="ghost" onClick={() => setStage("start")}>
          Back
        </Button>
      </>
    );

  return (
    <>
      {error ? <Flash tone="error">{error}</Flash> : null}
      {aiAvailable ? (
        <Card>
          <Cap>AI meal scan</Cap>
          <p className="mt-1 text-xs">
            Take a photo and get an estimate of calories and protein. You review and
            correct it before anything is saved.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => cam.current?.click()}>
              Take photo
            </Button>
            <Button type="button" variant="ghost" onClick={() => pick.current?.click()}>
              Choose photo
            </Button>
          </div>
          <input
            ref={cam}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void run(f);
            }}
          />
          <input
            ref={pick}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void run(f);
            }}
          />
          <label className="mt-3 block text-xs font-bold text-brand">
            Add a note to help the scan (optional)
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder="Homemade, paneer with moderate oil, 2 rotis"
              className={input}
            />
          </label>
        </Card>
      ) : null}
      {aiAvailable ? (
        <Card>
          <Cap>Describe your meal</Cap>
          <p className="mt-1 text-xs">
            No photo? Type what you ate and we will estimate it.
          </p>
          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => {
              if (!text.trim())
                return setError("Type what you ate in the note box above first.");
              void run(null);
            }}
          >
            Estimate from my description
          </Button>
        </Card>
      ) : null}
      <Button type="button" variant="ghost" onClick={() => setStage("manual")}>
        Add manually
      </Button>
    </>
  );
}
