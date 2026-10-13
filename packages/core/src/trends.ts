import { addDays, dayKey } from "./dates";

export interface DayCount {
  day: string;
  count: number;
}

/** Counts timestamps per day for the last `days` days ending on `endKey`, filling empty days with 0. */
export function dailySeries(
  timestamps: (string | null | undefined)[],
  days: number,
  endKey: string,
  tz?: string,
): DayCount[] {
  const counts = new Map<string, number>();
  for (const t of timestamps) {
    if (!t) continue;
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) continue;
    const k = dayKey(d, tz);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(endKey, i - (days - 1));
    return { day, count: counts.get(day) ?? 0 };
  });
}

/** Total of a series, and the change against the previous period of the same length. */
export function seriesTotals(
  current: DayCount[],
  previousTotal: number,
): { total: number; change: number | null } {
  const total = current.reduce((n, d) => n + d.count, 0);
  return {
    total,
    change:
      previousTotal > 0
        ? Math.round(((total - previousTotal) / previousTotal) * 100)
        : null,
  };
}
