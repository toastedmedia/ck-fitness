import Link from "next/link";
import type { WeekDay } from "@ck/core";
import { Card, Pill } from "@/components/app/ui";

const NAMES = ["M", "T", "W", "T", "F", "S", "S"];
const FULL = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const STATE_TEXT = {
  done: "workout completed",
  planned: "workout planned",
  missed: "workout missed",
  rescheduled: "workout moved",
  rest: "no workout planned",
} as const;

/** This Week: one status per day, the weekly target, and (separately) the CK Streak. */
export function WeeklyProgress({
  week,
  completed,
  target,
  consistency,
  streak,
}: {
  week: WeekDay[];
  completed: number;
  target: number;
  consistency: number;
  streak: number;
}) {
  const remaining = Math.max(0, target - completed);
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-bold text-brand">This Week</h2>
        {streak >= 2 ? <Pill tone="gold">CK Streak · {streak} days</Pill> : null}
      </div>
      <ol className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-muted">
        {week.map((d) => (
          <li key={d.date} className="flex flex-col items-center gap-1">
            {NAMES[d.dow]}
            <span
              role="img"
              aria-label={`${FULL[d.dow]}${d.isToday ? " (today)" : ""}: ${STATE_TEXT[d.state]}`}
              className={`grid size-7 place-items-center rounded-full border-2 text-[11px] ${
                d.state === "done"
                  ? "border-success bg-success text-white"
                  : d.state === "planned"
                    ? "border-accent"
                    : d.state === "missed"
                      ? "border-dashed border-[#d9a08f] text-[#b3402f]"
                      : d.isToday
                        ? "border-brand"
                        : "border-line"
              }`}
            >
              {d.state === "done" ? "✓" : d.state === "missed" ? "!" : ""}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-end justify-between gap-2 text-xs">
        <div>
          <p className="font-bold text-brand">
            {completed} of {target} workouts completed
          </p>
          <p className="text-muted">
            {remaining === 0
              ? "Weekly target met"
              : `${remaining} workout${remaining === 1 ? "" : "s"} remaining`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold text-brand">Consistency: {consistency}%</p>
          <Link
            href="/accountability"
            className="inline-flex min-h-9 items-center text-[11px] font-bold text-brand underline underline-offset-4"
          >
            View week
          </Link>
        </div>
      </div>
    </Card>
  );
}
