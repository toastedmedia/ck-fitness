import Link from "next/link";
import { LineChart } from "@/components/app/charts";
import { Button, Cap, Card, Pill } from "@/components/app/ui";
import { logWeight } from "@/app/(app)/actions";

/** Current weight, change and a small trend. Weight matters, but it is not the only progress. */
export function WeightProgress({
  current,
  change,
  points,
  cycleDays,
  daysSince,
  showForm,
}: {
  current: number | null;
  change: number | null;
  points: { x: string; y: number }[];
  cycleDays: number;
  daysSince: number | null;
  showForm: boolean;
}) {
  return (
    <Card id="weight" className="scroll-mt-4">
      <div className="flex items-center justify-between">
        <Cap>Weight Progress</Cap>
        <Link
          href="/progress"
          className="inline-flex min-h-9 items-center text-[11px] font-bold text-brand underline underline-offset-4"
        >
          View progress
        </Link>
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Current weight</p>
          <p className="text-2xl font-extrabold leading-none tracking-tight text-brand tabular-nums">
            {current !== null ? current.toFixed(1) : "-"}
            <span className="text-xs font-semibold text-muted"> kg</span>
          </p>
        </div>
        {change !== null ? (
          <Pill tone={change <= 0 ? "success" : "navy"}>
            {change <= 0 ? "↓" : "↑"} {Math.abs(change)} kg
          </Pill>
        ) : null}
      </div>
      {points.length >= 2 ? (
        <div className="mt-1">
          <LineChart label="Your weight over time" unit=" kg" points={points} />
        </div>
      ) : null}
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {Array.from({ length: cycleDays }, (_, i) => (
          <i
            key={i}
            className={`h-[5px] flex-1 rounded-full ${i < (daysSince ?? 0) ? "bg-accent" : "bg-line"}`}
          />
        ))}
      </div>
      <details open={showForm} className="mt-1">
        <summary className="flex min-h-11 cursor-pointer items-center text-xs font-bold text-brand underline underline-offset-4">
          Log Weight
        </summary>
        <form action={logWeight} className="mt-1 flex items-end gap-2">
          <label className="flex-1 text-xs font-semibold">
            Weight (kg)
            <input
              name="weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={35}
              max={300}
              required
              defaultValue={current !== null ? current.toFixed(1) : ""}
              className="mt-1 min-h-11 w-full rounded-2xl border-2 border-line bg-surface px-3 text-sm"
            />
          </label>
          <Button variant="primary">Save</Button>
        </form>
      </details>
    </Card>
  );
}
