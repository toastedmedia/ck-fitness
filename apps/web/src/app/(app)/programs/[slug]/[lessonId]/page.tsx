import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Paywall } from "@/components/app/Paywall";
import { VideoPlayer } from "@/components/app/VideoPlayer";
import { ActionButton } from "@/components/app/ActionButton";
import { Button, Cap, Card, Pill } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { getProgramOutline } from "@/lib/programs";
import { recoverWorkout } from "../../../actions";
import { completeLesson } from "../../actions";

export const metadata: Metadata = { title: "Lesson" };

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const { slug, lessonId } = await params;
  const ctx = await getContext();
  const { supabase, user, today } = ctx;

  const { data: program } = await supabase
    .from("programs")
    .select("id,title,slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!program) notFound();
  const { flat } = await getProgramOutline(ctx, program.id);
  const idx = flat.findIndex((l) => l.id === lessonId);
  if (idx < 0) notFound();

  // The database only returns the lesson text and video ID when she has access.
  const { data: lesson } = await supabase
    .from("lessons")
    .select(
      "id,title,summary,instructions,equipment,safety_notes,duration_minutes,stream_uid,resource_path",
    )
    .eq("id", lessonId)
    .maybeSingle();
  const prev = flat[idx - 1],
    next = flat[idx + 1];

  if (!lesson) {
    const { data: price } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "membership_price_display")
      .maybeSingle();
    return (
      <>
        <Link
          href={`/programs/${slug}`}
          className="inline-flex min-h-10 items-center text-xs font-bold text-brand"
        >
          ← {program.title}
        </Link>
        <h1 className="font-display text-[19px] text-brand">{flat[idx].title}</h1>
        <Paywall
          price={String(price?.value ?? "$29.99 CAD / month").replace(/^"|"$/g, "")}
        />
      </>
    );
  }

  const [{ data: prog }, { data: planned }] = await Promise.all([
    supabase
      .from("lesson_progress")
      .select("playback_seconds,completed_at")
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId)
      .maybeSingle(),
    supabase
      .from("scheduled_actions")
      .select("id")
      .eq("user_id", user.id)
      .eq("action_type", "workout")
      .eq("scheduled_for", today)
      .eq("status", "planned")
      .maybeSingle(),
  ]);

  return (
    <>
      <Link
        href={`/programs/${slug}`}
        className="inline-flex min-h-10 items-center text-xs font-bold text-brand"
      >
        ← {program.title}
      </Link>
      <VideoPlayer
        lessonId={lesson.id}
        startSeconds={prog?.playback_seconds ?? 0}
        hasVideo={Boolean(lesson.stream_uid)}
      />
      <div>
        <div className="flex flex-wrap gap-1.5">
          {lesson.duration_minutes ? (
            <Pill tone="navy">{lesson.duration_minutes} min</Pill>
          ) : null}
          {lesson.equipment ? <Pill tone="navy">{lesson.equipment}</Pill> : null}
          {prog?.completed_at ? <Pill>Completed</Pill> : null}
        </div>
        <h1 className="mt-2 font-display text-[19px] text-brand">{lesson.title}</h1>
        {lesson.summary ? (
          <p className="mt-1 text-xs text-muted">{lesson.summary}</p>
        ) : null}
      </div>
      {lesson.instructions ? (
        <Card>
          <Cap>Coaching points</Cap>
          <p className="mt-1 whitespace-pre-line text-xs">{lesson.instructions}</p>
        </Card>
      ) : null}
      {lesson.safety_notes ? (
        <Card className="border-[#ecdca4] bg-[#fbf5e1]">
          <Cap>Safety note</Cap>
          <p className="mt-1 text-xs">{lesson.safety_notes}</p>
        </Card>
      ) : null}
      {lesson.resource_path ? (
        <a
          href={`/api/resource?lessonId=${lesson.id}`}
          className="inline-flex min-h-11 items-center text-xs font-bold text-brand underline underline-offset-4"
        >
          Download the guide (PDF)
        </a>
      ) : null}

      <form action={completeLesson.bind(null, lesson.id, program.id, slug)}>
        <Button variant="primary" className="min-h-12 w-full">
          {prog?.completed_at ? "Completed. Continue" : "Mark complete"}
        </Button>
      </form>
      <div className="grid grid-cols-2 gap-2">
        {prev ? (
          <Link
            href={`/programs/${slug}/${prev.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-button border-2 border-line text-xs font-bold text-brand"
          >
            Previous
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/programs/${slug}/${next.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-button border-2 border-line text-xs font-bold text-brand"
          >
            Next
          </Link>
        ) : (
          <span />
        )}
      </div>

      <Card>
        <Cap>I cannot do this today</Cap>
        <p className="mt-1 text-xs text-muted">
          That is okay. Choose what works for you.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {planned ? (
            <ActionButton run={recoverWorkout.bind(null, planned.id, "reschedule")}>
              Reschedule
            </ActionButton>
          ) : null}
          {planned ? (
            <ActionButton run={recoverWorkout.bind(null, planned.id, "skip")}>
              Skip with a note
            </ActionButton>
          ) : null}
          <Link
            href="/accountability/help"
            className="inline-flex min-h-11 items-center px-2 text-xs font-bold text-brand underline underline-offset-4"
          >
            Talk to CK
          </Link>
        </div>
      </Card>
    </>
  );
}
