import { notFound } from "next/navigation";
import {
  attentionItems,
  buildWeek,
  DEFAULT_GOALS,
  nextMilestone,
  supportiveLine,
  type ActionStatus,
} from "@ck/core";
import { Nav } from "@/components/app/Nav";
import { AppleHealthPreview } from "@/components/home/AppleHealthPreview";
import { BMIWidget } from "@/components/home/BMIWidget";
import { CKScore } from "@/components/home/CKScore";
import { DayProvider } from "@/components/home/DayProvider";
import { HomeHeader } from "@/components/home/HomeHeader";
import { MyCommitment } from "@/components/home/MyCommitment";
import { NeedsAttention } from "@/components/home/NeedsAttention";
import { NextMilestone } from "@/components/home/NextMilestone";
import { TodaysWorkout } from "@/components/home/TodaysWorkout";
import { WaterTracker } from "@/components/home/WaterTracker";
import { WeeklyProgress } from "@/components/home/WeeklyProgress";
import { WeightProgress } from "@/components/home/WeightProgress";

export const dynamic = "force-dynamic";

/** Development-only preview of the Home components with sample data. Returns 404 in production. */
export default async function DevHome({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.NODE_ENV === "production" && !process.env.CK_DEV_PREVIEW) notFound();
  const { state = "busy" } = await searchParams;
  const rest = state === "rest";
  const calm = state === "rest" || state === "calm";
  const goals = DEFAULT_GOALS;
  const today = "2026-10-09"; // Friday
  const actions: { id: string; scheduled_for: string; status: ActionStatus }[] = [
    { id: "a1", scheduled_for: "2026-10-05", status: "completed" },
    { id: "a2", scheduled_for: "2026-10-07", status: calm ? "completed" : "planned" },
    { id: "a3", scheduled_for: "2026-10-09", status: rest ? "rescheduled" : "planned" },
  ];
  const week = buildWeek("2026-10-05", today, actions);
  const items = calm
    ? []
    : attentionItems({
        firstName: "Priya",
        today,
        weigh: { daysSince: 13, show: true, dueIn: 0 },
        weighEveryDays: 7,
        checkinDoneThisWeek: false,
        daysInactive: 0,
        missedWorkout: { id: "a2", date: "2026-10-07" },
        paymentProblem: state === "payment",
      });
  const milestone = nextMilestone({
    program: { sectionTitle: "Week 2", remaining: 2 },
    week: { target: 4, completed: 1 },
    weeklyCheckinDone: false,
    waterRemainingMl: 2000,
  });
  return (
    <div className="min-h-dvh pb-24 md:pl-56">
      <Nav />
      <main className="mx-auto flex max-w-xl flex-col gap-3 px-4 pt-6">
        <HomeHeader
          date="Friday, 9 October"
          greeting="Good morning"
          name="Priya"
          line={supportiveLine({ score: 28, streak: 3, missed: !calm, weekDone: false })}
          unread={2}
          initial="P"
        />
        <NeedsAttention items={items} />
        <TodaysWorkout
          restDay={rest}
          done={false}
          workout={{
            label: "Today · Week 2 · Day 2",
            title: "Lower Body Strength",
            subtitle: "32 min · Bands + mat",
            href: "/programs/x/y",
            scheduled: true,
            cover: null,
            section: { title: "Week 2", remaining: 2 },
          }}
        />
        <DayProvider
          initial={{ waterMl: 500, steps: 3500, checkinDone: false }}
          goals={goals}
          workoutScheduled={!rest}
          workoutDone={false}
          weighScheduled={true}
          weighDone={false}
        >
          <div className="flex flex-col gap-3">
            <CKScore name="Priya" />
            <MyCommitment target={4} completed={calm ? 2 : 1} />
            <WaterTracker />
          </div>
        </DayProvider>
        <WeightProgress
          current={67.2}
          change={-1.2}
          points={[68.4, 68.1, 68.0, 67.7, 67.5, 67.2].map((y, i) => ({
            x: `10-0${i + 1}`,
            y,
          }))}
          cycleDays={7}
          daysSince={4}
          showForm={false}
        />
        <BMIWidget bmi={23.8} hidden={false} />
        <WeeklyProgress
          week={week}
          completed={calm ? 2 : 1}
          target={4}
          consistency={50}
          streak={3}
        />
        <NextMilestone text={milestone?.text ?? null} earned={null} />
        <AppleHealthPreview />
      </main>
    </div>
  );
}
