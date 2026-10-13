import Link from "next/link";
import { addDays, BARRIERS, CHECKIN_FIELDS } from "@ck/core";
import { Cap, Card } from "@/components/app/ui";
import { getContext } from "@/lib/app";

const DAYS = 14;
const SCORE: Record<string, number> = {
  low: 1,
  poor: 1,
  none: 4,
  mild: 3,
  high: 1,
  okay: 2,
  fair: 2,
  good: 3,
  great: 4,
};

/** One small bar per day, filled to how close she got to her goal. Text below says it in words too. */
function DayBars({
  values,
  label,
}: {
  values: { date: string; fraction: number }[];
  label: string;
}) {
  return (
    <div role="img" aria-label={label} className="flex h-14 items-end gap-1">
      {values.map((v) => (
        <div key={v.date} className="flex h-full flex-1 items-end rounded-[4px] bg-line">
          <div
            className={`w-full rounded-[4px] ${v.fraction >= 1 ? "bg-success" : "bg-accent"}`}
            style={{
              height: `${Math.max(v.fraction > 0 ? 8 : 0, Math.min(100, v.fraction * 100))}%`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** Hydration and step consistency, check-in history, what is getting in the way, and escalation to a coach. */
export async function AccountabilityInsights() {
  const { supabase, user, today, goals } = await getContext();
  const since = addDays(today, -(DAYS - 1));
  const [habits, daily, weekly, barriers] = await Promise.all([
    supabase
      .from("habit_logs")
      .select("log_date,habit_type,value")
      .eq("user_id", user.id)
      .gte("log_date", since),
    supabase
      .from("daily_checkins")
      .select("check_date,energy,soreness,sleep,mood,optional_note")
      .eq("user_id", user.id)
      .gte("check_date", since)
      .order("check_date", { ascending: false }),
    supabase
      .from("weekly_checkins")
      .select("week_start,obstacle")
      .eq("user_id", user.id)
      .order("week_start", { ascending: false })
      .limit(6),
    supabase
      .from("scheduled_actions")
      .select("barrier")
      .eq("user_id", user.id)
      .not("barrier", "is", null)
      .gte("scheduled_for", addDays(today, -30)),
  ]);

  const days = Array.from({ length: DAYS }, (_, i) => addDays(since, i));
  const water = new Map<string, number>(),
    steps = new Map<string, number>();
  for (const h of (habits.data ?? []) as {
    log_date: string;
    habit_type: string;
    value: number;
  }[]) {
    if (h.habit_type === "water_ml")
      water.set(h.log_date, (water.get(h.log_date) ?? 0) + Number(h.value));
    else steps.set(h.log_date, Number(h.value));
  }
  const waterVals = days.map((d) => ({
    date: d,
    fraction: (water.get(d) ?? 0) / goals.waterTargetMl,
  }));
  const stepVals = days.map((d) => ({
    date: d,
    fraction: (steps.get(d) ?? 0) / goals.stepGoal,
  }));
  const waterHit = waterVals.filter((v) => v.fraction >= 1).length;
  const stepHit = stepVals.filter((v) => v.fraction >= 1).length;
  const loggedSteps = [...steps.values()].filter((v) => v > 0);
  const avgSteps = loggedSteps.length
    ? Math.round(loggedSteps.reduce((a, b) => a + b, 0) / loggedSteps.length)
    : 0;

  const checkins = (daily.data ?? []) as {
    check_date: string;
    energy: string;
    soreness: string;
    sleep: string;
    mood: string;
    optional_note: string | null;
  }[];
  const labelFor = (field: keyof typeof CHECKIN_FIELDS, v: string) =>
    CHECKIN_FIELDS[field].options.find(([k]) => k === v)?.[1] ?? v;
  const dot = (v: string, inverse = false) => {
    const s = SCORE[v] ?? 2;
    const good = inverse ? s <= 2 : s >= 3;
    return good ? "bg-success" : s === 2 ? "bg-accent" : "bg-[#d9a08f]";
  };

  const counts = new Map<string, number>();
  for (const b of (barriers.data ?? []) as { barrier: string }[])
    counts.set(b.barrier, (counts.get(b.barrier) ?? 0) + 1);
  for (const w of (weekly.data ?? []) as { obstacle: string | null }[])
    if (w.obstacle) counts.set(w.obstacle, (counts.get(w.obstacle) ?? 0) + 1);
  const NICE = new Map<string, string>([
    ...BARRIERS.map(([k, l]) => [k, l] as [string, string]),
    ["time", "No time"],
    ["energy", "Low energy"],
    ["travel", "Travel"],
    ["illness", "Illness"],
    ["soreness", "Feeling sore"],
    ["family_work", "Family or work"],
    ["motivation", "Low motivation"],
    ["other", "Other"],
  ]);
  const topBarriers = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <>
      <Card>
        <div className="flex items-center justify-between">
          <Cap>Hydration</Cap>
          <span className="text-[11px] font-bold text-brand">
            {waterHit} of {DAYS} days on target
          </span>
        </div>
        <div className="mt-2">
          <DayBars
            values={waterVals}
            label={`Water over the last ${DAYS} days: target reached on ${waterHit} days`}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted">
          Target {goals.waterTargetMl / 1000} L a day. Gold is partway, green is on
          target.
        </p>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <Cap>Steps</Cap>
          <span className="text-[11px] font-bold text-brand">
            {stepHit} of {DAYS} days on goal
          </span>
        </div>
        <div className="mt-2">
          <DayBars
            values={stepVals}
            label={`Steps over the last ${DAYS} days: goal reached on ${stepHit} days`}
          />
        </div>
        <p className="mt-1 text-[11px] text-muted">
          {avgSteps
            ? `Average ${avgSteps.toLocaleString("en-CA")} steps on days you logged.`
            : "No steps logged yet."}{" "}
          Goal {goals.stepGoal.toLocaleString("en-CA")}.
        </p>
      </Card>

      <Card>
        <Cap>Daily check-ins</Cap>
        {checkins.length === 0 ? (
          <p className="mt-1 text-xs text-muted">
            Your quick daily check-ins will show here, so you can spot patterns in energy,
            sleep and mood.
          </p>
        ) : (
          <>
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {checkins.slice(0, 7).map((c) => (
                <li key={c.check_date} className="py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-brand">
                      {new Date(`${c.check_date}T12:00:00Z`).toLocaleDateString("en-CA", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </span>
                    <span className="flex gap-3 text-muted">
                      <span className="inline-flex items-center gap-1">
                        <i className={`size-2 rounded-full ${dot(c.energy)}`} />
                        Energy {labelFor("energy", c.energy)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <i className={`size-2 rounded-full ${dot(c.sleep)}`} />
                        Sleep {labelFor("sleep", c.sleep)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <i className={`size-2 rounded-full ${dot(c.mood)}`} />
                        Mood {labelFor("mood", c.mood)}
                      </span>
                    </span>
                  </div>
                  {c.soreness === "high" || c.optional_note ? (
                    <p className="mt-1 text-[11px] text-muted">
                      {c.soreness === "high" ? "Soreness: high. " : ""}
                      {c.optional_note ?? ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10.5px] text-muted">
              {checkins.length} check-in{checkins.length === 1 ? "" : "s"} in the last{" "}
              {DAYS} days.
            </p>
          </>
        )}
      </Card>

      <Card>
        <Cap>What&apos;s getting in the way</Cap>
        {topBarriers.length === 0 ? (
          <p className="mt-1 text-xs text-muted">
            Nothing flagged recently. If a workout slips, tell us why and it will show
            here, so we can help you work around it.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {topBarriers.map(([k, n]) => (
              <li
                key={k}
                className="rounded-full bg-page px-3 py-1 text-xs font-semibold text-brand"
              >
                {NICE.get(k) ?? k} · {n}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="bg-brand text-on-brand">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-accent">
          Need more support?
        </p>
        <h3 className="mt-1 text-sm font-bold text-on-brand">Talk to your CK coach</h3>
        <p className="mt-0.5 text-xs text-[#b9bddb]">
          If life got busy, something hurts, or you are stuck, send a message. A real
          person will reply.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/accountability/help?topic=coaching"
            className="inline-flex min-h-11 items-center rounded-button bg-accent px-4 text-xs font-bold text-on-accent"
          >
            Message my coach
          </Link>
          <Link
            href="/accountability/summary"
            className="inline-flex min-h-11 items-center rounded-button border border-white/25 px-4 text-xs font-bold text-on-brand"
          >
            Weekly review
          </Link>
        </div>
      </Card>
    </>
  );
}
