"use client";

import { useState } from "react";
import { DayRing } from "@/components/app/DayRing";
import { useDay } from "./DayProvider";
import { CheckinSheet } from "./CheckinSheet";

const LABEL = {
  workout: "Workout",
  water: "Water",
  checkin: "Check-in",
  steps: "Steps",
  weigh: "Weigh-in",
} as const;

const Tick = ({ done }: { done: boolean }) => (
  <span
    aria-hidden="true"
    className={`grid size-4 shrink-0 place-items-center rounded-full border-2 ${done ? "border-success bg-success text-white" : "border-line"}`}
  >
    {done ? (
      <svg
        viewBox="0 0 24 24"
        className="size-2.5 fill-none stroke-current"
        strokeWidth="4"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    ) : null}
  </span>
);

/** Today's CK Score: only the actions that apply today, updating as she logs them. */
export function CKScore({ name }: { name: string }) {
  const day = useDay();
  const [sheet, setSheet] = useState(false);
  const [editSteps, setEditSteps] = useState(false);
  const [stepsDraft, setStepsDraft] = useState("");

  const value = (key: string): string => {
    const it = day.items.find((i) => i.key === key);
    const done = it ? it.fraction >= 1 : false;
    switch (key) {
      case "workout":
        return done ? "1/1" : "0/1";
      case "water":
        return `${+(day.waterMl / 1000).toFixed(2)} / ${day.goals.waterTargetMl / 1000} L`;
      case "checkin":
        return done ? "1/1" : "0/1";
      case "steps":
        return `${day.steps.toLocaleString("en-CA")} / ${day.goals.stepGoal.toLocaleString("en-CA")}`;
      default:
        return done ? "1/1" : "0/1";
    }
  };

  return (
    <section
      aria-labelledby="ck-score"
      className="rounded-card border border-line bg-surface p-[var(--space-card)]"
    >
      <div className="flex items-center justify-between">
        <h2
          id="ck-score"
          className="text-[11px] font-bold uppercase tracking-[0.1em] text-accent-strong"
        >
          Today&apos;s CK Score
        </h2>
        {day.score >= 100 ? (
          <span className="text-[11px] font-bold text-success">All done, {name}</span>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-[112px_minmax(0,1fr)] items-center gap-3">
        <DayRing pct={day.score} caption="Complete" />
        <ul className="flex flex-col">
          {day.items.map((it) => (
            <li
              key={it.key}
              id={it.key === "steps" ? "steps" : undefined}
              className="flex min-h-9 items-center gap-2 text-xs"
            >
              <Tick done={it.fraction >= 1} />
              <span className="font-semibold">{LABEL[it.key]}</span>
              <span className="ml-auto whitespace-nowrap text-right tabular-nums text-muted">
                {value(it.key)}
              </span>
              {it.key === "checkin" && it.fraction < 1 ? (
                <button
                  type="button"
                  onClick={() => setSheet(true)}
                  className="min-h-9 pl-1 text-[11px] font-bold text-brand underline underline-offset-4"
                >
                  Do it
                </button>
              ) : null}
              {it.key === "steps" ? (
                <button
                  type="button"
                  onClick={() => {
                    setStepsDraft(day.steps ? String(day.steps) : "");
                    setEditSteps((v) => !v);
                  }}
                  aria-expanded={editSteps}
                  className="min-h-9 pl-1 text-[11px] font-bold text-brand underline underline-offset-4"
                >
                  Update
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      {editSteps ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Math.round(Number(stepsDraft));
            if (Number.isFinite(n) && n >= 0 && n <= 100000) {
              void day.saveSteps(n);
              setEditSteps(false);
            }
          }}
          className="mt-2 flex items-end gap-2 border-t border-line pt-2"
        >
          <label className="flex-1 text-xs font-semibold">
            Steps today
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100000}
              value={stepsDraft}
              onChange={(e) => setStepsDraft(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-2xl border-2 border-line bg-surface px-3 text-sm"
            />
          </label>
          <button className="min-h-11 rounded-button bg-brand px-4 text-xs font-bold text-on-brand">
            Save
          </button>
        </form>
      ) : null}
      {day.error ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-danger">
          {day.error}
        </p>
      ) : null}
      <CheckinSheet
        open={sheet}
        onClose={() => setSheet(false)}
        onSaved={day.markCheckinDone}
      />
    </section>
  );
}
