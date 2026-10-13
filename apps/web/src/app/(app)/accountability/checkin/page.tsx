import type { Metadata } from "next";
import { addDays, weekProgress, weekStart, type ActionStatus } from "@ck/core";
import { DayPicker, Scale } from "@/components/app/Scale";
import { Button, Card, Flash } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { ensurePlan } from "@/lib/plan";
import { submitWeeklyCheckin } from "../../actions";

export const metadata: Metadata = { title: "Weekly check-in" };

const OBSTACLES = [
  ["time", "Time"],
  ["energy", "Energy"],
  ["travel", "Travel"],
  ["illness", "Illness"],
  ["soreness", "Soreness"],
  ["family_work", "Family or work"],
  ["motivation", "Motivation"],
  ["other", "Other"],
];

export default async function CheckinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getContext();
  const plan = await ensurePlan(ctx);
  const start = weekStart(ctx.today);
  const { data } = await ctx.supabase
    .from("scheduled_actions")
    .select("scheduled_for,status")
    .eq("user_id", ctx.user.id)
    .eq("action_type", "workout")
    .gte("scheduled_for", start)
    .lte("scheduled_for", addDays(start, 6));
  const prog = weekProgress(
    (data ?? []) as { scheduled_for: string; status: ActionStatus }[],
  );

  return (
    <>
      <h1 className="sr-only">Weekly check-in</h1>
      <p className="text-xs text-muted">
        You planned {prog.planned} and completed {prog.completed} this week. Every bit
        counts.
      </p>
      {sp.error ? (
        <Flash tone="error">Please answer the four scale questions.</Flash>
      ) : null}
      <form action={submitWeeklyCheckin} className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <Scale
            name="energy"
            label="How was your energy this week?"
            low="Low"
            high="High"
          />
          <Scale name="sleep" label="How was your sleep?" low="Poor" high="Great" />
          <Scale
            name="soreness"
            label="How sore or uncomfortable did you feel?"
            low="None"
            high="A lot"
          />
          <p className="-mt-2 text-[10.5px] text-muted">
            Concerning or sharp pain should be checked by a health professional.
          </p>
          <Scale
            name="confidence"
            label="How confident do you feel about next week?"
            low="Not very"
            high="Very"
          />
        </Card>
        <Card className="flex flex-col gap-3">
          <label className="text-xs font-bold text-brand">
            What got in your way?
            <select
              name="obstacle"
              defaultValue=""
              className="mt-1 min-h-11 w-full rounded-2xl border-2 border-line bg-surface px-3 text-sm font-normal"
            >
              <option value="">Nothing in particular</option>
              {OBSTACLES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-brand">
            Anything CK should know? (optional)
            <textarea
              name="note"
              rows={3}
              maxLength={500}
              className="mt-1 w-full rounded-2xl border-2 border-line bg-surface p-3 text-sm font-normal"
            />
          </label>
        </Card>
        <Card className="flex flex-col gap-3">
          <label className="text-xs font-bold text-brand">
            Workouts next week
            <select
              name="next_target"
              defaultValue={plan.weekly_target_workouts}
              className="mt-1 min-h-11 w-full rounded-2xl border-2 border-line bg-surface px-3 text-sm font-normal"
            >
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <DayPicker selected={plan.preferred_days} />
        </Card>
        <Button variant="primary" className="min-h-12">
          Save check-in
        </Button>
      </form>
    </>
  );
}
