"use client";

import { useDay } from "./DayProvider";

const btn =
  "min-h-11 flex-1 rounded-button border-2 border-line text-xs font-bold text-brand";

/** Quick water logging. One tap, no confirmation; the CK Score updates at once. */
export function WaterTracker() {
  const day = useDay();
  const target = day.goals.waterTargetMl;
  const pct = Math.min(100, Math.round((day.waterMl / target) * 100));
  const litres = (ml: number) => `${+(ml / 1000).toFixed(2)}`;
  return (
    <section
      aria-labelledby="water-h"
      className="rounded-card border border-line bg-surface p-[var(--space-card)]"
    >
      <div className="flex items-baseline justify-between">
        <h2 id="water-h" className="text-[13px] font-bold text-brand">
          Water
        </h2>
        <span className="text-xs tabular-nums text-muted">
          <b className="text-sm text-brand">{litres(day.waterMl)}</b> / {litres(target)} L
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Water progress"
        className="mt-2 h-2 overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-success transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className={btn} onClick={() => void day.addWater(250)}>
          +250 mL
        </button>
        <button type="button" className={btn} onClick={() => void day.addWater(500)}>
          +500 mL
        </button>
        {day.waterMl > 0 ? (
          <button
            type="button"
            aria-label="Undo last water entry"
            className="min-h-11 px-2 text-xs font-bold text-brand underline underline-offset-4"
            onClick={() => void day.undoWater()}
          >
            Undo
          </button>
        ) : null}
      </div>
    </section>
  );
}
