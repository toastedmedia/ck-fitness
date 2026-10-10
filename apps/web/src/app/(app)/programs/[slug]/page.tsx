import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccess, type AccessLevel } from "@ck/core";
import { Paywall } from "@/components/app/Paywall";
import { Button, Card, Cap, Flash, Pill } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { coverUrl, getProgramOutline } from "@/lib/programs";
import { track } from "@/lib/events";
import { getViewer } from "@/lib/viewer";
import { startProgram } from "../actions";

export const metadata: Metadata = { title: "Program" };

export default async function ProgramPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getContext();
  const { supabase, user } = ctx;
  const { viewer } = await getViewer();

  const { data: program } = await supabase
    .from("programs")
    .select(
      "id,slug,title,short_description,long_description,cover_path,access_level,level,duration_label",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!program) notFound();
  const level = program.access_level as AccessLevel;
  const allowed = canAccess(viewer, level);

  const [
    { outline, flat },
    { data: enr },
    { data: done },
    { data: price },
    { data: more },
  ] = await Promise.all([
    getProgramOutline(ctx, program.id),
    supabase
      .from("program_enrollments")
      .select("status,current_lesson_id")
      .eq("user_id", user.id)
      .eq("program_id", program.id)
      .maybeSingle(),
    supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", user.id)
      .not("completed_at", "is", null),
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "membership_price_display")
      .maybeSingle(),
    supabase
      .from("programs")
      .select("slug,title")
      .neq("id", program.id)
      .order("sort_order")
      .limit(2),
  ]);
  const doneSet = new Set(
    ((done ?? []) as { lesson_id: string }[]).map((d) => d.lesson_id),
  );
  const doneCount = flat.filter((l) => doneSet.has(l.id)).length;
  const pct = flat.length ? Math.round((doneCount / flat.length) * 100) : 0;
  const cover = coverUrl(program.cover_path);
  await track(user.id, "program_viewed", { program: slug });
  if (!allowed && level !== "coach_only")
    await track(user.id, "paywall_viewed", { source: "program" });

  return (
    <>
      <Link
        href="/programs"
        className="inline-flex min-h-10 items-center text-xs font-bold text-brand"
      >
        ← Programs
      </Link>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className="aspect-[16/8] w-full rounded-card object-cover"
        />
      ) : (
        <div
          className="aspect-[16/8] w-full rounded-card bg-gradient-to-br from-brand-soft to-brand"
          aria-hidden="true"
        />
      )}
      <div>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={level === "free" ? "success" : "gold"}>
            {level === "free" ? "Free" : level === "coach_only" ? "Coaching" : "Member"}
          </Pill>
          {program.duration_label ? (
            <Pill tone="navy">{program.duration_label}</Pill>
          ) : null}
          {program.level ? <Pill tone="navy">{program.level}</Pill> : null}
        </div>
        <h1 className="mt-2 font-display text-[19px] text-brand">{program.title}</h1>
        <p className="mt-1 text-xs text-muted">{program.short_description}</p>
      </div>

      {sp.error === "locked" ? (
        <Flash tone="error">That content is for members.</Flash>
      ) : null}
      {sp.done ? <Flash>Program complete. Well done.</Flash> : null}
      {program.long_description ? (
        <Card>
          <Cap>What you will do</Cap>
          <p className="mt-1 whitespace-pre-line text-xs">{program.long_description}</p>
        </Card>
      ) : null}

      {enr ? (
        <div>
          <div className="flex justify-between text-xs">
            <b className="text-brand">Your progress</b>
            <span className="text-muted">{pct}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}

      {allowed ? (
        <form action={startProgram.bind(null, program.id, program.slug)}>
          <Button variant="primary" className="min-h-12 w-full">
            {enr
              ? enr.status === "completed"
                ? "Do it again"
                : "Continue program"
              : "Start program"}
          </Button>
        </form>
      ) : level === "coach_only" ? (
        <Card className="bg-page">
          <Cap>Coaching</Cap>
          <p className="mt-1 text-xs">
            This program is part of one-to-one coaching with CK.
          </p>
          <Link
            href={`/accountability/help?topic=coaching&program=${program.slug}`}
            className="mt-2 inline-flex min-h-11 items-center rounded-button bg-accent px-5 text-xs font-bold text-on-accent"
          >
            Ask about coaching
          </Link>
        </Card>
      ) : (
        <Paywall
          price={String(price?.value ?? "$29.99 CAD / month").replace(/^"|"$/g, "")}
        />
      )}

      {pct >= 80 && more && more.length ? (
        <Card>
          <Cap>What is next</Cap>
          <p className="mt-1 text-xs text-muted">
            You are almost there. Take a look at your next step.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(more as { slug: string; title: string }[]).map((m) => (
              <Link
                key={m.slug}
                href={`/programs/${m.slug}`}
                className="inline-flex min-h-11 items-center rounded-button border-2 border-line px-4 text-xs font-bold text-brand"
              >
                {m.title}
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3">
        {outline.map((s) => (
          <Card key={s.id}>
            <h2 className="text-[13px] font-bold text-brand">{s.title}</h2>
            <ol className="mt-2 flex flex-col divide-y divide-line">
              {s.lessons.map((l) => {
                const open = canAccess(viewer, l.effective_access);
                const isDone = doneSet.has(l.id);
                const inner = (
                  <>
                    <span
                      aria-hidden="true"
                      className={`grid size-5 shrink-0 place-items-center rounded-full border-2 text-[10px] ${isDone ? "border-success bg-success text-white" : "border-line text-muted"}`}
                    >
                      {isDone ? "✓" : open ? "" : "🔒"}
                    </span>
                    <span className="min-w-0 flex-1 text-xs font-semibold">
                      {l.title}
                    </span>
                    {l.duration_minutes ? (
                      <span className="text-[10.5px] text-muted">
                        {l.duration_minutes} min
                      </span>
                    ) : null}
                    {!open ? <span className="sr-only">Locked, members only</span> : null}
                  </>
                );
                return (
                  <li key={l.id}>
                    {open && enr ? (
                      <Link
                        href={`/programs/${program.slug}/${l.id}`}
                        className="flex min-h-11 items-center gap-2"
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div
                        className={`flex min-h-11 items-center gap-2 ${open ? "" : "opacity-60"}`}
                      >
                        {inner}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </Card>
        ))}
        {outline.length === 0 ? (
          <p className="text-xs text-muted">Content is being added. Check back soon.</p>
        ) : null}
      </div>
    </>
  );
}
