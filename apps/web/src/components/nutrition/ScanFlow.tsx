"use client";
import { useRef, useState } from "react";
import {
  AI_CONSENT_TEXT,
  ESTIMATE_FROM_PHOTO,
  MAX_PHOTO_BYTES,
  photoPath,
} from "@ck/core";
import { Button, Cap, Card, Flash } from "@/components/app/ui";
import {
  MealEditor,
  type EditorInitial,
  type EditorItem,
} from "@/components/nutrition/MealEditor";
import { compressPhoto } from "@/lib/image-compress";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { giveAiConsent, saveMeal, scanMeal } from "@/app/(app)/nutrition/actions";

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
  aiConsent,
  recent,
}: {
  userId: string;
  base: Omit<EditorInitial, "items">;
  aiAvailable: boolean;
  aiConsent: boolean;
  recent: { id: string; label: string; items: EditorItem[] }[];
}) {
  const [stage, setStage] = useState<Stage>("start");
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [path, setPath] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [initial, setInitial] = useState<EditorInitial | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [manualItems, setManualItems] = useState<EditorItem[]>([]);
  const [fix, setFix] = useState("");
  const [version, setVersion] = useState(0);
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

  async function run(file: File | null, correction = "") {
    setError("");
    setStage("working");
    // A correction re-uses the photo already uploaded; nothing is uploaded twice.
    const reuse = correction ? path : "";
    let uploaded = reuse;
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
        description: correction
          ? `${text} Correction from the member about an earlier estimate: ${correction}`.trim()
          : text,
        mealType: base.mealType,
      });
      if (!r.ok) {
        if (correction && initial) {
          // Keep what we had; just say why the re-estimate did not work.
          setError(r.error);
          setStage("review");
          return;
        }
        if (uploaded) await discardPhoto(uploaded);
        setPreview(null);
        setError(r.error);
        setStage("start");
        return;
      }
      setFix("");
      setVersion((v) => v + 1);
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
      if (uploaded && !reuse) await discardPhoto(uploaded);
      setError((e as Error).message || "Something went wrong. Please try again.");
      if (correction && initial) {
        setStage("review");
        return;
      }
      setPreview(null);
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
        {error ? <Flash tone="error">{error}</Flash> : null}
        <MealEditor
          key={version}
          action={saveMeal}
          confirmLabel="Confirm meal"
          initial={{ ...initial, photoUrl: preview }}
        />
        <Card>
          <Cap>Something look off?</Cap>
          <label className="mt-1 block text-xs font-bold text-brand">
            Tell the AI what to fix
            <input
              value={fix}
              onChange={(e) => setFix(e.target.value)}
              maxLength={300}
              placeholder="It was 3 rotis, and the dal had no ghee"
              className={input}
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full"
            onClick={() => {
              if (!fix.trim()) return setError("Type what to fix first.");
              void run(null, fix.trim());
            }}
          >
            Re-estimate (uses 1 AI scan)
          </Button>
        </Card>
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
          initial={{ ...base, description: text || base.description, items: manualItems }}
        />
        <Button type="button" variant="ghost" onClick={() => setStage("start")}>
          Back
        </Button>
      </>
    );

  return (
    <>
      {error ? <Flash tone="error">{error}</Flash> : null}
      {aiAvailable && !aiConsent ? (
        <Card>
          <Cap>Before your first AI scan</Cap>
          <p className="mt-1 text-xs">{AI_CONSENT_TEXT}</p>
          <p className="mt-2 text-[11px] text-muted">
            You can always add meals manually instead. Details are in our Privacy Policy.
          </p>
          <form action={giveAiConsent} className="mt-3">
            <Button className="w-full">I agree, continue</Button>
          </form>
        </Card>
      ) : null}
      {aiAvailable && aiConsent ? (
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
      {aiAvailable && aiConsent ? (
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
      {recent.length > 0 ? (
        <Card>
          <Cap>Log again</Cap>
          <p className="mt-1 text-xs">Your usual meals, one tap to start from.</p>
          <ul className="mt-2 flex flex-col gap-2">
            {recent.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setManualItems(m.items);
                    setStage("manual");
                  }}
                  className="min-h-11 w-full rounded-xl border-2 border-line px-3 text-left text-xs font-bold text-brand"
                >
                  {m.label}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setManualItems([]);
          setStage("manual");
        }}
      >
        Add manually
      </Button>
    </>
  );
}
