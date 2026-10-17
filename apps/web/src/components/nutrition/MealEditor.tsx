"use client";
import { useMemo, useState } from "react";
import {
  ESTIMATE_DISCLAIMER,
  MEAL_LABELS,
  MEAL_TYPES,
  approxKcal,
  grams,
  itemsTotal,
} from "@ck/core";
import { Button, Cap, Card } from "@/components/app/ui";

export interface EditorItem {
  name: string;
  serving: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  confidence?: string | null;
  ai?: { calories: number; protein: number; carbs: number; fat: number };
}

export interface EditorInitial {
  id?: string;
  mealType: string;
  date: string;
  time: string;
  description: string;
  items: EditorItem[];
  photoPath?: string;
  photoUrl?: string | null;
  aiEstimated?: boolean;
  aiModel?: string;
  aiNotes?: string;
  share?: boolean;
}

const input =
  "mt-1 min-h-11 w-full rounded-2xl border-2 border-line bg-surface px-3 text-sm font-normal";
const blank = (): EditorItem => ({
  name: "",
  serving: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
});
const num = (s: string) => (Number.isFinite(Number(s)) && s !== "" ? Number(s) : 0);

/**
 * Edit what was eaten: used for AI results, manual entry and editing saved meals.
 * Totals update as you type. Saving recomputes everything on the server.
 */
export function MealEditor({
  initial,
  action,
  confirmLabel,
}: {
  initial: EditorInitial;
  action: (formData: FormData) => void | Promise<void>;
  confirmLabel: string;
}) {
  const [items, setItems] = useState<EditorItem[]>(
    initial.items.length ? initial.items : [blank()],
  );
  const set = (i: number, k: keyof EditorItem, v: string) =>
    setItems((s) => s.map((x, n) => (n === i ? { ...x, [k]: v } : x)));
  const total = useMemo(
    () =>
      itemsTotal(
        items.map((i) => ({
          calories: num(i.calories),
          protein: num(i.protein),
          carbs: num(i.carbs),
          fat: num(i.fat),
        })),
      ),
    [items],
  );
  const payload = JSON.stringify(
    items.map((i) => ({
      name: i.name,
      serving: i.serving,
      calories: num(i.calories),
      protein: num(i.protein),
      carbs: num(i.carbs),
      fat: num(i.fat),
      confidence: i.confidence ?? null,
      ai: i.ai,
    })),
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={initial.id ?? ""} />
      <input type="hidden" name="items" value={payload} />
      <input type="hidden" name="photo_path" value={initial.photoPath ?? ""} />
      <input type="hidden" name="ai" value={initial.aiEstimated ? "1" : "0"} />
      <input type="hidden" name="ai_model" value={initial.aiModel ?? ""} />
      <input type="hidden" name="ai_notes" value={initial.aiNotes ?? ""} />

      {initial.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={initial.photoUrl}
          alt="Your meal"
          className="aspect-[4/3] w-full rounded-card object-cover"
        />
      ) : null}

      <Card>
        <Cap>{initial.aiEstimated ? "Estimated meal" : "Your meal"}</Cap>
        <p className="mt-1 text-2xl font-extrabold text-brand">
          {initial.aiEstimated ? approxKcal(total.calories) : `${total.calories} kcal`}
        </p>
        <p className="text-xs">
          Protein {grams(total.protein)} · Carbs {grams(total.carbs)} · Fat{" "}
          {grams(total.fat)}
        </p>
        {initial.aiEstimated ? (
          <p className="mt-2 text-[11px] text-muted">{ESTIMATE_DISCLAIMER}</p>
        ) : null}
        {initial.aiNotes ? (
          <p className="mt-1 text-[11px] text-muted">{initial.aiNotes}</p>
        ) : null}
      </Card>

      {items.map((it, i) => (
        <Card key={i}>
          <div className="flex items-center justify-between gap-2">
            <Cap>Item {i + 1}</Cap>
            {items.length > 1 ? (
              <button
                type="button"
                onClick={() => setItems((s) => s.filter((_, n) => n !== i))}
                className="min-h-10 px-2 text-xs font-bold text-danger"
              >
                Remove
              </button>
            ) : null}
          </div>
          <label className="text-xs font-bold text-brand">
            Food
            <input
              value={it.name}
              onChange={(e) => set(i, "name", e.target.value)}
              maxLength={120}
              placeholder="For example: Dal"
              className={input}
            />
          </label>
          <label className="mt-2 block text-xs font-bold text-brand">
            Serving
            <input
              value={it.serving}
              onChange={(e) => set(i, "serving", e.target.value)}
              maxLength={160}
              placeholder="1 bowl"
              className={input}
            />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(
              [
                ["calories", "Calories (kcal)"],
                ["protein", "Protein (g)"],
                ["carbs", "Carbs (g)"],
                ["fat", "Fat (g)"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="text-xs font-bold text-brand">
                {label}
                <input
                  inputMode="decimal"
                  value={it[k]}
                  onChange={(e) => set(i, k, e.target.value.replace(/[^0-9.]/g, ""))}
                  className={input}
                />
              </label>
            ))}
          </div>
        </Card>
      ))}
      <Button
        type="button"
        variant="ghost"
        onClick={() => setItems((s) => [...s, blank()])}
      >
        + Add an item
      </Button>

      <Card>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-brand">
            Meal
            <select name="meal_type" defaultValue={initial.mealType} className={input}>
              {MEAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEAL_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-brand">
            Time
            <input
              type="time"
              name="time"
              defaultValue={initial.time}
              className={input}
            />
          </label>
          <label className="col-span-2 text-xs font-bold text-brand">
            Date
            <input
              type="date"
              name="date"
              defaultValue={initial.date}
              className={input}
            />
          </label>
          <label className="col-span-2 text-xs font-bold text-brand">
            Note (optional)
            <input
              name="description"
              defaultValue={initial.description}
              maxLength={500}
              placeholder="Homemade, light oil"
              className={input}
            />
          </label>
        </div>
        <label className="mt-3 flex min-h-11 items-center gap-2 text-xs">
          <input
            type="checkbox"
            name="share"
            value="on"
            defaultChecked={initial.share ?? true}
            className="size-5 accent-brand"
          />
          Share this meal with my CK coach (if my nutrition sharing is on)
        </label>
      </Card>

      <Button>{confirmLabel}</Button>
    </form>
  );
}
