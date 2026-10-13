import Link from "next/link";
import type { TodayWorkout } from "@/lib/programs";
import { ActionButton } from "@/components/app/ActionButton";
import { Pill } from "@/components/app/ui";
import { completeWorkout } from "@/app/(app)/actions";

const gold =
  "inline-flex min-h-12 items-center justify-center rounded-button bg-accent px-6 text-sm font-bold text-on-accent";
const soft =
  "inline-flex min-h-11 items-center rounded-button border border-white/25 px-4 text-xs font-bold text-on-brand";

/**
 * The hero card: today's workout, or a rest day with gentle options. A program cover can show
 * faintly on the right, but never behind the text.
 */
export function TodaysWorkout({
  workout,
  done,
  restDay,
}: {
  workout: TodayWorkout;
  done: boolean;
  restDay: boolean;
}) {
  if (restDay && !done) {
    return (
      <section className="rounded-card bg-brand p-4 text-on-brand">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-accent">
          Today
        </p>
        <h2 className="mt-1 text-lg font-bold text-on-brand">Recovery / Rest Day</h2>
        <p className="mt-0.5 text-xs text-[#b9bddb]">
          Recovery is part of the plan. Choose something gentle.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/programs?view=categories&category=mobility" className={soft}>
            Mobility
          </Link>
          <Link href="#steps" className={soft}>
            Walk
          </Link>
          <Link href="/programs?view=categories&category=mobility" className={soft}>
            Stretch
          </Link>
          <Link href="/accountability" className={soft}>
            View tomorrow&apos;s workout
          </Link>
        </div>
        {workout.href ? (
          <Link
            href={workout.href}
            className="mt-3 inline-block min-h-10 text-xs font-bold text-accent underline underline-offset-4"
          >
            Feeling good? Train anyway: {workout.title}
          </Link>
        ) : null}
      </section>
    );
  }
  return (
    <section className="relative overflow-hidden rounded-card bg-brand p-4 text-on-brand">
      {workout.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={workout.cover}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 h-full w-2/5 object-cover opacity-25 [mask-image:linear-gradient(to_left,black,transparent)]"
        />
      ) : null}
      <div className="relative">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-accent">
          {workout.label}
        </p>
        <h2 className="mt-1 max-w-[85%] text-lg font-bold leading-snug text-on-brand">
          {workout.title}
        </h2>
        <p className="mt-0.5 text-xs text-[#b9bddb]">{workout.subtitle}</p>
        <div className="mt-3">
          {done ? (
            <Pill tone="gold">Workout complete</Pill>
          ) : workout.href ? (
            <Link href={workout.href} className={`${gold} w-full sm:w-auto`}>
              Start workout
            </Link>
          ) : workout.scheduled ? (
            <ActionButton
              variant="gold"
              run={completeWorkout}
              className="min-h-12 w-full px-6 text-sm sm:w-auto"
            >
              Mark workout done
            </ActionButton>
          ) : (
            <Link href="/programs" className={gold}>
              Choose a training
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
