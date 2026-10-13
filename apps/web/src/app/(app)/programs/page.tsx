import type { Metadata } from "next";
import Link from "next/link";
import { canAccess, type AccessLevel } from "@ck/core";
import { ProgramCard, type CardProgram } from "@/components/app/ProgramCard";
import { getContext } from "@/lib/app";
import { coverUrl } from "@/lib/programs";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Programs" };

const VIEWS = [
  ["all", "All programs"],
  ["mine", "My Programs"],
  ["free", "Free"],
  ["member", "Member Library"],
  ["categories", "Categories"],
] as const;
type Tag = { tag_group: string; slug: string; label: string };
type Row = {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  cover_path: string | null;
  access_level: AccessLevel;
  level: string | null;
  duration_label: string | null;
  featured: boolean;
  created_at: string;
  program_tag_map: { content_tags: Tag }[];
};

const chip = (on: boolean) =>
  `inline-flex min-h-10 items-center whitespace-nowrap rounded-chip border-2 px-3 text-xs font-semibold ${on ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink"}`;

export default async function ProgramsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const view = VIEWS.some(([v]) => v === sp.view) ? sp.view! : "all";
  const ctx = await getContext();
  const { supabase, user } = ctx;
  const { viewer } = await getViewer();

  const [programs, enrollments, sections, outline, done, tags] = await Promise.all([
    supabase
      .from("programs")
      .select(
        "id,slug,title,short_description,cover_path,access_level,level,duration_label,featured,created_at,program_tag_map(content_tags(tag_group,slug,label))",
      )
      .order("sort_order")
      .order("created_at", { ascending: false }),
    supabase
      .from("program_enrollments")
      .select("program_id,status")
      .eq("user_id", user.id),
    supabase.from("program_sections").select("id,program_id"),
    supabase.from("lesson_outline").select("id,section_id"),
    supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", user.id)
      .not("completed_at", "is", null),
    supabase
      .from("content_tags")
      .select("tag_group,slug,label")
      .in("tag_group", ["category", "goal", "delivery"])
      .order("sort_order"),
  ]);

  const sectionProgram = new Map(
    ((sections.data ?? []) as { id: string; program_id: string }[]).map((s) => [
      s.id,
      s.program_id,
    ]),
  );
  const totals = new Map<string, number>(),
    completed = new Map<string, number>();
  const doneSet = new Set(
    ((done.data ?? []) as { lesson_id: string }[]).map((d) => d.lesson_id),
  );
  for (const l of (outline.data ?? []) as { id: string; section_id: string }[]) {
    const pid = sectionProgram.get(l.section_id);
    if (!pid) continue;
    totals.set(pid, (totals.get(pid) ?? 0) + 1);
    if (doneSet.has(l.id)) completed.set(pid, (completed.get(pid) ?? 0) + 1);
  }
  const enrolled = new Set(
    ((enrollments.data ?? []) as { program_id: string }[]).map((e) => e.program_id),
  );

  const all = ((programs.data ?? []) as unknown as Row[]).filter(
    (p) => p.access_level !== "hidden",
  );
  const toCard = (p: Row): CardProgram => {
    const t = totals.get(p.id) ?? 0;
    return {
      slug: p.slug,
      title: p.title,
      short_description: p.short_description,
      cover: coverUrl(p.cover_path),
      access_level: p.access_level,
      level: p.level,
      duration_label: p.duration_label,
      locked: !canAccess(viewer, p.access_level),
      tags: p.program_tag_map
        .map((m) => m.content_tags)
        .filter((t) => t.tag_group === "delivery")
        .map((t) => t.label),
      progressPct:
        enrolled.has(p.id) && t > 0
          ? Math.round(((completed.get(p.id) ?? 0) / t) * 100)
          : null,
    };
  };
  const hasTag = (p: Row, group: string, slug?: string) =>
    !slug ||
    p.program_tag_map.some(
      (m) => m.content_tags.tag_group === group && m.content_tags.slug === slug,
    );
  const query = (sp.q ?? "").trim().toLowerCase().slice(0, 60);
  const filtered = all.filter(
    (p) =>
      hasTag(p, "goal", sp.goal) &&
      hasTag(p, "delivery", sp.delivery) &&
      hasTag(p, "category", sp.category) &&
      (!sp.level || p.level === sp.level) &&
      (!query ||
        p.title.toLowerCase().includes(query) ||
        p.short_description.toLowerCase().includes(query)),
  );
  const t = (g: string) => ((tags.data ?? []) as Tag[]).filter((x) => x.tag_group === g);

  const qs = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v) q.set(k, v);
    return `/programs?${q}`;
  };

  let body: React.ReactNode;
  const list = (
    rows: Row[],
    empty = "Nothing here yet. New programs are added regularly.",
  ) =>
    rows.length === 0 ? (
      <p className="text-xs text-muted">{empty}</p>
    ) : (
      <div className="flex flex-col gap-3">
        {rows.map((p) => (
          <ProgramCard key={p.slug} p={toCard(p)} />
        ))}
      </div>
    );
  const row = (title: string, rows: Row[]) =>
    rows.length === 0 ? null : (
      <section key={title} className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-brand">{title}</h2>
        <div className="flex flex-col gap-3">
          {rows.map((p) => (
            <ProgramCard key={p.slug} p={toCard(p)} />
          ))}
        </div>
      </section>
    );

  if (view === "mine")
    body = list(
      filtered.filter((p) => enrolled.has(p.id)),
      "You have not started a program yet. Pick one from All programs.",
    );
  else if (view === "free")
    body = list(filtered.filter((p) => p.access_level === "free"));
  else if (view === "member")
    body = list(filtered.filter((p) => p.access_level !== "free"));
  else if (view === "categories") {
    body = (
      <>
        <div className="flex flex-wrap gap-2">
          {t("category").map((c) => (
            <Link
              key={c.slug}
              href={qs({ category: sp.category === c.slug ? undefined : c.slug })}
              className={chip(sp.category === c.slug)}
            >
              {c.label}
            </Link>
          ))}
        </div>
        {list(filtered, "No programs in this category yet.")}
      </>
    );
  } else {
    // Every program appears exactly once: the ones she has started, then free, then the member library.
    const started = filtered.filter((p) => enrolled.has(p.id));
    const rest = filtered.filter((p) => !enrolled.has(p.id));
    body = (
      <div className="flex flex-col gap-5">
        {row("Continue training", started)}
        {row(
          "Free programs",
          rest.filter((p) => p.access_level === "free"),
        )}
        {row(
          "Member library",
          rest.filter((p) => p.access_level !== "free"),
        )}
        {filtered.length === 0 ? (
          <p className="text-xs text-muted">No programs match these filters.</p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <h1 className="sr-only">Programs</h1>
      <form method="get" role="search" className="flex gap-2">
        {Object.entries(sp)
          .filter(([k, v]) => k !== "q" && v)
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        <input
          type="search"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search programs"
          aria-label="Search programs"
          className="min-h-11 flex-1 rounded-2xl border-2 border-line bg-surface px-3 text-sm"
        />
        <button className="min-h-11 rounded-button bg-brand px-4 text-xs font-bold text-on-brand">
          Search
        </button>
      </form>
      <nav
        aria-label="Program views"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        {VIEWS.map(([v, label]) => (
          <Link
            key={v}
            href={qs({ view: v === "all" ? undefined : v })}
            aria-current={view === v ? "page" : undefined}
            className={chip(view === v)}
          >
            {label}
          </Link>
        ))}
      </nav>
      <details
        className="rounded-card border border-line bg-surface px-3"
        open={Boolean(sp.goal || sp.level || sp.delivery)}
      >
        <summary className="flex min-h-11 cursor-pointer items-center text-xs font-bold text-brand">
          Filters
        </summary>
        <div className="flex flex-col gap-2 pb-3">
          <div className="flex flex-wrap gap-2">
            {t("goal").map((g) => (
              <Link
                key={g.slug}
                href={qs({ goal: sp.goal === g.slug ? undefined : g.slug })}
                className={chip(sp.goal === g.slug)}
              >
                {g.label}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {["beginner", "intermediate", "advanced"].map((l) => (
              <Link
                key={l}
                href={qs({ level: sp.level === l ? undefined : l })}
                className={chip(sp.level === l)}
              >
                {l[0].toUpperCase() + l.slice(1)}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {t("delivery")
              .filter((d) => d.slug === "home" || d.slug === "gym")
              .map((d) => (
                <Link
                  key={d.slug}
                  href={qs({ delivery: sp.delivery === d.slug ? undefined : d.slug })}
                  className={chip(sp.delivery === d.slug)}
                >
                  {d.label}
                </Link>
              ))}
          </div>
        </div>
      </details>
      {body}
    </>
  );
}
