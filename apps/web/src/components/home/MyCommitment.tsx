import Link from "next/link";
import { Card, Cap } from "@/components/app/ui";

/** Her weekly promise at a glance. Links to the Accountability tab, where it can be changed. */
export function MyCommitment({
  target,
  completed,
}: {
  target: number;
  completed: number;
}) {
  const remaining = Math.max(0, target - completed);
  const squares = Array.from({ length: Math.min(target, 7) }, (_, i) => i < completed);
  return (
    <Card>
      <div className="flex items-center justify-between">
        <Cap>My Commitment</Cap>
        <Link
          href="/accountability"
          className="inline-flex min-h-9 items-center text-[11px] font-bold text-brand underline underline-offset-4"
        >
          {remaining === 0 ? "View Week" : "View Week"}
        </Link>
      </div>
      <p className="mt-1 text-[15px] font-extrabold text-brand">
        {completed} of {target} workouts completed
      </p>
      <div
        className="mt-2 flex gap-1.5"
        role="img"
        aria-label={`${completed} of ${target} workouts completed this week`}
      >
        {squares.map((done, i) => (
          <span
            key={i}
            className={`h-2.5 flex-1 rounded-[4px] ${done ? "bg-success" : "bg-line"}`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        {remaining === 0
          ? "You've met this week's commitment. Lovely work."
          : `${remaining} workout${remaining === 1 ? "" : "s"} remaining this week.`}
      </p>
    </Card>
  );
}
