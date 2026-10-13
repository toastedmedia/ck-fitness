/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ABtn, Flash, H1, Panel, Status, Tile, aInput } from "@/components/admin/ui";
import { ImageInput } from "@/components/admin/ImageInput";
import { LessonPreview } from "@/components/admin/LessonPreview";
import { VideoUploader } from "@/components/admin/VideoUploader";
import { CONTENT, requireStaff } from "@/lib/admin";
import { loadProgramProgress } from "@/lib/program-progress";
import { coverUrl } from "@/lib/programs";
import {
  addSection,
  applyLearningToAll,
  createLesson,
  deleteLesson,
  deleteSection,
  duplicateLesson,
  duplicateSection,
  moveLesson,
  moveSection,
  publishProgram,
  saveLesson,
  unpublishProgram,
  updateProgram,
  updateProgramSettings,
  updateSection,
} from "../../actions";

export const metadata: Metadata = { title: "Edit program" };

const ACCESS = [
  ["free", "Free"],
  ["member", "Member"],
  ["premium_preview", "Premium preview"],
  ["coach_only", "Coach only"],
  ["hidden", "Hidden"],
];
const lab = "text-xs font-bold text-brand";

export default async function EditProgram({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, roles, db } = await requireStaff([...CONTENT, "coach"]);
  const canEdit = roles.some((r) => (CONTENT as string[]).includes(r));
  const { data: p } = await supabase
    .from("programs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();
  const [{ data: sections }, { data: tags }, { data: mapped }] = await Promise.all([
    supabase
      .from("program_sections")
      .select("*")
      .eq("program_id", id)
      .order("order_index"),
    supabase
      .from("content_tags")
      .select("id,tag_group,label")
      .order("tag_group")
      .order("sort_order"),
    supabase.from("program_tag_map").select("tag_id").eq("program_id", id),
  ]);
  const secs = (sections ?? []) as {
    id: string;
    title: string;
    section_type: string;
    order_index: number;
    published: boolean;
  }[];
  const { data: lessons } = secs.length
    ? await supabase
        .from("lessons")
        .select("*")
        .in(
          "section_id",
          secs.map((s) => s.id),
        )
        .order("order_index")
    : { data: [] };
  const byTag = new Set(((mapped ?? []) as { tag_id: string }[]).map((m) => m.tag_id));
  const tagGroups = new Map<string, { id: string; label: string }[]>();
  for (const t of (tags ?? []) as { id: string; tag_group: string; label: string }[])
    tagGroups.set(t.tag_group, [...(tagGroups.get(t.tag_group) ?? []), t]);
  const cover = coverUrl(p.cover_path);
  const problems = sp.problems?.split("|").filter(Boolean) ?? [];
  const errorText: Record<string, string> = {
    cover: "Cover must be a JPG, PNG or WebP under 2 MB.",
    resource: "Resource must be a PDF or image under 4 MB.",
    save: "That did not save. Please try again.",
    section: "Please enter a section title.",
    lesson: "Please enter a lesson title.",
  };

  type LessonRow = Record<string, string | number | boolean | null>;
  const all = (lessons ?? []) as LessonRow[];
  const selLesson = all.find((l) => String(l.id) === sp.lesson) ?? null;
  const selWeek = selLesson
    ? (secs.find((x) => x.id === selLesson.section_id) ?? null)
    : (secs.find((x) => x.id === sp.week) ?? null);
  const view = selLesson
    ? "lesson"
    : selWeek
      ? "week"
      : sp.view === "settings"
        ? "settings"
        : sp.view === "progress"
          ? "progress"
          : "details";
  const progress = view === "progress" ? await loadProgramProgress(db, id) : null;
  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = (progress?.members ?? []).filter(
    (m) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
  );
  const PAGE = 25;
  const pageNo = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const pageRows = filtered.slice((pageNo - 1) * PAGE, pageNo * PAGE);
  const fmtDay = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("en-CA", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "America/Vancouver",
        }).format(new Date(iso))
      : "-";
  const lessonsOf = (sid: string) => all.filter((l) => l.section_id === sid);
  const row = (active: boolean) =>
    `relative flex items-center gap-1 rounded-xl hover:bg-page ${active ? "bg-page" : ""}`;

  return (
    <>
      <H1
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Status tone={p.published ? "ok" : "warn"}>
              {p.published ? "Published" : "Draft"}
            </Status>
            <Link
              href={`/admin/programs/${id}/preview?as=free`}
              className="text-sm font-bold text-brand underline"
            >
              Preview as Free
            </Link>
            <Link
              href={`/admin/programs/${id}/preview?as=member`}
              className="text-sm font-bold text-brand underline"
            >
              Preview as Member
            </Link>
          </div>
        }
      >
        {p.title}
      </H1>
      {sp.saved ? <Flash>Saved.</Flash> : null}
      {sp.lpub ? (
        <Flash>Saved and published. Members can see this lesson now.</Flash>
      ) : null}
      {sp.lunpub ? (
        <Flash>Moved to draft. Members no longer see this lesson.</Flash>
      ) : null}
      {sp.cloned ? (
        <Flash>Cloned. This copy is a draft right under the original.</Flash>
      ) : null}
      {sp.published ? <Flash>Published. Members can see it now.</Flash> : null}
      {sp.unpublished ? (
        <Flash>Unpublished. It is hidden from members immediately.</Flash>
      ) : null}
      {sp.error ? (
        <Flash bad>{errorText[sp.error] ?? "Something went wrong."}</Flash>
      ) : null}
      {problems.length ? (
        <Flash bad>Fix these before publishing: {problems.join(" ")}</Flash>
      ) : null}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <aside
          className={`rounded-card border border-line bg-surface p-2 ${view === "details" || view === "settings" || view === "progress" ? "" : "order-2 lg:order-none"}`}
          aria-label="Program outline"
        >
          <div className="px-2 pb-1 pt-2 text-sm font-extrabold text-brand">
            {p.title}
          </div>
          {(
            [
              ["details", "Details and publish", ""],
              ["settings", "Instructor and settings", "?view=settings"],
              ["progress", "Member progress", "?view=progress"],
            ] as const
          ).map(([key, label, qs]) => (
            <Link
              key={key}
              href={`/admin/programs/${id}${qs}`}
              className={`${row(view === key)} min-h-10 px-2 text-sm font-bold ${view === key ? "text-accent-strong" : "text-brand"}`}
            >
              {label}
            </Link>
          ))}
          <div className="mx-2 my-2 border-t border-line" />
          {secs.map((s, si) => (
            <details key={s.id} open className="relative mt-1">
              <summary
                className={`flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-2 pr-12 text-sm font-bold text-brand hover:bg-page [&::-webkit-details-marker]:hidden ${view === "week" && selWeek?.id === s.id ? "bg-page" : ""}`}
              >
                <span aria-hidden="true" className="text-muted">
                  ▾
                </span>
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                {s.published ? null : <Status tone="warn">Hidden</Status>}
                <span className="rounded-full bg-page px-2 text-[11px] text-muted">
                  {lessonsOf(s.id).length}
                </span>
              </summary>
              {canEdit ? (
                <div className="absolute right-1 top-1">
                  <Menu label={`Actions for ${s.title}`}>
                    <Link href={`/admin/programs/${id}?week=${s.id}`} className={mi}>
                      Edit week
                    </Link>
                    <form action={duplicateSection.bind(null, id, s.id)}>
                      <button className={mi}>Clone week</button>
                    </form>
                    {si > 0 ? (
                      <form action={moveSection.bind(null, id, s.id, "up")}>
                        <button className={mi}>Move up</button>
                      </form>
                    ) : null}
                    {si < secs.length - 1 ? (
                      <form action={moveSection.bind(null, id, s.id, "down")}>
                        <button className={mi}>Move down</button>
                      </form>
                    ) : null}
                    <Link
                      href={`/admin/programs/${id}?week=${s.id}&confirm=delete`}
                      className={`${mi} text-danger`}
                    >
                      Delete
                    </Link>
                  </Menu>
                </div>
              ) : null}
              <div className="ml-3 flex flex-col gap-px border-l-2 border-line pl-2">
                {lessonsOf(s.id).map((l, li, arr) => (
                  <div key={String(l.id)} className={row(selLesson?.id === l.id)}>
                    <Link
                      href={`/admin/programs/${id}?lesson=${l.id}`}
                      className={`min-h-10 min-w-0 flex-1 truncate px-2 py-2.5 text-sm ${selLesson?.id === l.id ? "font-bold text-accent-strong" : "text-brand"}`}
                      title={String(l.title)}
                    >
                      {String(l.title)}
                    </Link>
                    <Status tone={l.published ? "ok" : "warn"}>
                      {l.published ? "Published" : "Draft"}
                    </Status>
                    {canEdit ? (
                      <Menu label={`Actions for ${l.title}`}>
                        <Link
                          href={`/admin/programs/${id}?lesson=${l.id}`}
                          className={mi}
                        >
                          Edit
                        </Link>
                        <form action={duplicateLesson.bind(null, id, String(l.id))}>
                          <button className={mi}>Clone</button>
                        </form>
                        {li > 0 ? (
                          <form
                            action={moveLesson.bind(null, id, s.id, String(l.id), "up")}
                          >
                            <button className={mi}>Move up</button>
                          </form>
                        ) : null}
                        {li < arr.length - 1 ? (
                          <form
                            action={moveLesson.bind(null, id, s.id, String(l.id), "down")}
                          >
                            <button className={mi}>Move down</button>
                          </form>
                        ) : null}
                        <Link
                          href={`/admin/programs/${id}?lesson=${l.id}&confirm=delete`}
                          className={`${mi} text-danger`}
                        >
                          Delete
                        </Link>
                      </Menu>
                    ) : null}
                  </div>
                ))}
                {canEdit ? (
                  <form action={createLesson.bind(null, id, s.id)}>
                    <button className="my-1 min-h-10 w-full rounded-xl border border-dashed border-line px-3 text-left text-sm font-bold text-accent-strong hover:bg-page">
                      + Add lesson
                    </button>
                  </form>
                ) : null}
              </div>
            </details>
          ))}
          {canEdit ? (
            <details className="mt-2 rounded-xl border border-dashed border-line p-2">
              <summary className="min-h-10 cursor-pointer list-none text-sm font-bold text-accent-strong [&::-webkit-details-marker]:hidden">
                + Add week, phase or module
              </summary>
              <form
                action={addSection.bind(null, id)}
                className="mt-2 flex flex-col gap-2"
              >
                <input
                  name="title"
                  required
                  className={aInput}
                  placeholder="Week 1"
                  aria-label="Title"
                />
                <select name="section_type" className={aInput} aria-label="Type">
                  <option value="week">Week</option>
                  <option value="phase">Phase</option>
                  <option value="module">Module</option>
                </select>
                <ABtn variant="primary">Add</ABtn>
              </form>
            </details>
          ) : null}
        </aside>

        <section className="flex min-w-0 flex-col gap-4">
          {view === "details" ? (
            <>
              <Panel title="Publish">
                <p className="text-sm text-muted">
                  Workflow: edit as draft, preview as Free and Member, then publish.
                  Unpublish hides it at once, with no deployment.
                </p>
                {canEdit ? (
                  p.published ? (
                    <form action={unpublishProgram.bind(null, id)} className="mt-2">
                      <ABtn variant="danger">Unpublish</ABtn>
                    </form>
                  ) : (
                    <form
                      action={publishProgram.bind(null, id)}
                      className="mt-2 flex flex-wrap items-center gap-3"
                    >
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="notify"
                          className="size-4 accent-brand"
                        />{" "}
                        Tell members who opted in
                      </label>
                      <ABtn variant="primary">Check and publish</ABtn>
                    </form>
                  )
                ) : null}
              </Panel>

              <Panel title="Details">
                <form
                  action={updateProgram.bind(null, id)}
                  className="grid gap-3 md:grid-cols-2"
                  encType="multipart/form-data"
                >
                  <label className={`${lab} md:col-span-2`}>
                    Title
                    <input
                      name="title"
                      defaultValue={p.title}
                      required
                      className={aInput}
                    />
                  </label>
                  <label className={lab}>
                    Web address (slug)
                    <input name="slug" defaultValue={p.slug} className={aInput} />
                  </label>
                  <label className={lab}>
                    Access
                    <select
                      name="access_level"
                      defaultValue={p.access_level}
                      className={aInput}
                    >
                      {ACCESS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={`${lab} md:col-span-2`}>
                    One-line benefit
                    <input
                      name="short_description"
                      defaultValue={p.short_description}
                      maxLength={200}
                      className={aInput}
                    />
                  </label>
                  <label className={`${lab} md:col-span-2`}>
                    What you will do
                    <textarea
                      name="long_description"
                      defaultValue={p.long_description}
                      rows={4}
                      maxLength={4000}
                      className={`${aInput} py-2`}
                    />
                  </label>
                  <label className={lab}>
                    Level
                    <select name="level" defaultValue={p.level ?? ""} className={aInput}>
                      <option value="">Choose</option>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </label>
                  <label className={lab}>
                    Duration
                    <input
                      name="duration_label"
                      defaultValue={p.duration_label ?? ""}
                      placeholder="5 days, 12 weeks"
                      className={aInput}
                    />
                  </label>
                  <label className={lab}>
                    Sort order
                    <input
                      name="sort_order"
                      type="number"
                      defaultValue={p.sort_order}
                      className={aInput}
                    />
                  </label>
                  <label className="flex items-center gap-2 pt-5 text-sm">
                    <input
                      type="checkbox"
                      name="featured"
                      defaultChecked={p.featured}
                      className="size-4 accent-brand"
                    />{" "}
                    Featured (shows under Popular)
                  </label>
                  <div className="md:col-span-2">
                    <span className={lab}>
                      Cover image (JPG, PNG or WebP, under 2 MB)
                    </span>
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        className="my-2 h-24 rounded-xl object-cover"
                      />
                    ) : null}
                    <ImageInput name="cover" />
                  </div>
                  <fieldset className="md:col-span-2">
                    <legend className={lab}>Tags</legend>
                    {[...tagGroups.entries()].map(([group, list]) => (
                      <div
                        key={group}
                        className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1"
                      >
                        <span className="w-20 text-[11px] font-bold uppercase text-muted">
                          {group}
                        </span>
                        {list.map((t) => (
                          <label key={t.id} className="flex items-center gap-1.5 text-sm">
                            <input
                              type="checkbox"
                              name="tags"
                              value={t.id}
                              defaultChecked={byTag.has(t.id)}
                              className="size-4 accent-brand"
                            />
                            {t.label}
                          </label>
                        ))}
                      </div>
                    ))}
                  </fieldset>
                  {canEdit ? (
                    <div className="md:col-span-2">
                      <ABtn variant="primary">Save details</ABtn>
                    </div>
                  ) : null}
                </form>
              </Panel>
            </>
          ) : null}

          {view === "settings" ? (
            <Panel title="Instructor and learning experience">
              <form
                action={updateProgramSettings.bind(null, id)}
                className="grid gap-3 md:grid-cols-2"
                encType="multipart/form-data"
              >
                <label className={lab}>
                  Instructor name
                  <input
                    name="instructor_name"
                    defaultValue={p.instructor_name ?? ""}
                    className={aInput}
                    placeholder="Chanveer Kaur"
                  />
                </label>
                <label className={lab}>
                  Instructor title
                  <input
                    name="instructor_title"
                    defaultValue={p.instructor_title ?? ""}
                    className={aInput}
                    placeholder="Women's Fitness Coach"
                  />
                </label>
                <label className={`${lab} md:col-span-2`}>
                  Bio
                  <textarea
                    name="instructor_bio"
                    defaultValue={p.instructor_bio ?? ""}
                    rows={4}
                    maxLength={1000}
                    className={`${aInput} py-2`}
                  />
                </label>
                <div className={`${lab} md:col-span-2`}>
                  Headshot (square works best)
                  {p.instructor_photo_path ? (
                    <img
                      src={coverUrl(p.instructor_photo_path) ?? ""}
                      alt=""
                      className="my-2 size-24 rounded-full object-cover"
                    />
                  ) : null}
                  <ImageInput name="instructor_photo" />
                  {p.instructor_photo_path ? (
                    <label className="mt-1 flex items-center gap-2 text-xs font-normal">
                      <input
                        type="checkbox"
                        name="remove_instructor_photo"
                        className="size-4 accent-brand"
                      />
                      Remove the headshot
                    </label>
                  ) : null}
                </div>
                <fieldset className="flex flex-col gap-2 md:col-span-2">
                  <legend className={lab}>Learning experience</legend>
                  {(
                    [
                      [
                        "autoplay_next",
                        "Automatically play the next lesson",
                        "When a video ends, the next lesson opens and starts.",
                      ],
                      [
                        "autoplay_first",
                        "Automatically play the first lesson",
                        "The first lesson starts as soon as a member opens it.",
                      ],
                      [
                        "auto_complete",
                        "Auto-complete lessons",
                        "A lesson is marked done when its video finishes. Off means members tap Mark complete.",
                      ],
                    ] as const
                  ).map(([name, label, hint]) => (
                    <label
                      key={name}
                      className="flex min-h-11 items-start gap-3 rounded-xl border border-line p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        name={name}
                        defaultChecked={Boolean(p[name])}
                        className="mt-0.5 size-5 accent-brand"
                      />
                      <span>
                        <b className="block text-brand">{label}</b>
                        <span className="text-xs text-muted">{hint}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                {canEdit ? (
                  <div className="flex flex-wrap gap-2 md:col-span-2">
                    <ABtn variant="primary">Save settings</ABtn>
                    <button
                      formAction={applyLearningToAll.bind(null, id)}
                      className="min-h-10 rounded-xl border-2 border-line px-4 text-sm font-bold text-brand"
                    >
                      Apply these switches to all programs
                    </button>
                  </div>
                ) : null}
              </form>
            </Panel>
          ) : null}

          {view === "progress" && progress ? (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Tile value={progress.enrolled} label="Members enrolled" />
                <Tile value={progress.started} label="Started learning" />
                <Tile value={progress.completed} label="Completed the program" />
                <Tile value={`${progress.averagePercent}%`} label="Average progress" />
              </div>
              <Panel title={`Members (${filtered.length})`}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <form className="flex flex-1 gap-2">
                    <input type="hidden" name="view" value="progress" />
                    <input
                      name="q"
                      defaultValue={sp.q ?? ""}
                      placeholder="Search name or email"
                      className={aInput}
                      aria-label="Search members"
                    />
                    <ABtn variant="ghost">Search</ABtn>
                  </form>
                  <a
                    href={`/admin/programs/${id}/progress`}
                    className="inline-flex min-h-10 items-center rounded-xl border-2 border-line px-4 text-sm font-bold text-brand"
                  >
                    Download CSV
                  </a>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead>
                      <tr className="text-xs text-muted">
                        <th className="py-2 pr-2">Member</th>
                        <th className="py-2 pr-2">Progress</th>
                        <th className="py-2 pr-2">Enrolled</th>
                        <th className="py-2 pr-2">Last accessed</th>
                        <th className="py-2">Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((m) => (
                        <tr key={m.userId} className="border-t border-line">
                          <td className="py-2 pr-2">
                            <Link
                              href={`/admin/users/${m.userId}`}
                              className="font-bold text-brand hover:underline"
                            >
                              {m.name}
                            </Link>
                            <span className="block text-xs text-muted">{m.email}</span>
                          </td>
                          <td className="py-2 pr-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-line">
                              <div
                                className="h-full bg-success"
                                style={{ width: `${m.percent}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted">
                              {m.completedLessons}/{m.totalLessons} · {m.percent}%
                            </span>
                          </td>
                          <td className="py-2 pr-2">{fmtDay(m.enrolledAt)}</td>
                          <td className="py-2 pr-2">{fmtDay(m.lastAccessed)}</td>
                          <td className="py-2">{m.sessions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pageRows.length === 0 ? (
                  <p className="py-3 text-sm text-muted">
                    {progress.enrolled
                      ? "No members match that search."
                      : "No one has started this program yet."}
                  </p>
                ) : null}
                {filtered.length > PAGE ? (
                  <div className="mt-3 flex items-center gap-3 text-sm">
                    {pageNo > 1 ? (
                      <Link
                        href={`/admin/programs/${id}?view=progress&q=${encodeURIComponent(sp.q ?? "")}&page=${pageNo - 1}`}
                        className="font-bold text-brand underline"
                      >
                        Previous
                      </Link>
                    ) : null}
                    <span className="text-muted">
                      Page {pageNo} of {Math.ceil(filtered.length / PAGE)}
                    </span>
                    {pageNo * PAGE < filtered.length ? (
                      <Link
                        href={`/admin/programs/${id}?view=progress&q=${encodeURIComponent(sp.q ?? "")}&page=${pageNo + 1}`}
                        className="font-bold text-brand underline"
                      >
                        Next
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </Panel>
            </>
          ) : null}

          {view === "week" && selWeek ? (
            <Panel title="Edit week">
              {sp.confirm === "delete" && canEdit ? (
                <div
                  role="alert"
                  className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#f6dcd7] p-3 text-sm font-bold text-danger"
                >
                  Delete this week and all {lessonsOf(selWeek.id).length} of its lessons?
                  <form action={deleteSection.bind(null, id, selWeek.id)}>
                    <ABtn variant="danger">Yes, delete</ABtn>
                  </form>
                  <Link
                    href={`/admin/programs/${id}?week=${selWeek.id}`}
                    className="underline"
                  >
                    Keep it
                  </Link>
                </div>
              ) : null}
              <form
                action={updateSection.bind(null, id, selWeek.id)}
                className="flex flex-wrap items-end gap-2"
              >
                <label className={`${lab} min-w-48 flex-1`}>
                  Title
                  <input name="title" defaultValue={selWeek.title} className={aInput} />
                </label>
                <label className={`${lab} w-24`}>
                  Order
                  <input
                    name="order_index"
                    type="number"
                    defaultValue={selWeek.order_index}
                    className={aInput}
                  />
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    name="published"
                    defaultChecked={selWeek.published}
                    className="size-4 accent-brand"
                  />
                  Visible to members
                </label>
                {canEdit ? <ABtn variant="primary">Save week</ABtn> : null}
              </form>
              {canEdit ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={duplicateSection.bind(null, id, selWeek.id)}>
                    <ABtn variant="ghost">Clone week</ABtn>
                  </form>
                  <form action={createLesson.bind(null, id, selWeek.id)}>
                    <ABtn variant="ghost">Add lesson</ABtn>
                  </form>
                  <Link
                    href={`/admin/programs/${id}?week=${selWeek.id}&confirm=delete`}
                    className="inline-flex min-h-10 items-center rounded-xl border-2 border-danger px-4 text-sm font-bold text-danger"
                  >
                    Delete week
                  </Link>
                </div>
              ) : null}
            </Panel>
          ) : null}

          {view === "lesson" && selLesson && selWeek ? (
            <Panel>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-xs text-muted">
                  {selWeek.title} &gt;{" "}
                  <b className="text-brand">{String(selLesson.title)}</b>
                </p>
                <Status tone={selLesson.published ? "ok" : "warn"}>
                  {selLesson.published ? "Published" : "Draft"}
                </Status>
                <Link
                  href={`/admin/programs/${id}/preview?as=member`}
                  className="text-xs font-bold text-brand underline"
                >
                  Preview as member
                </Link>
              </div>
              {sp.confirm === "delete" && canEdit ? (
                <div
                  role="alert"
                  className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-[#f6dcd7] p-3 text-sm font-bold text-danger"
                >
                  Delete this lesson and its video?
                  <form action={deleteLesson.bind(null, id, String(selLesson.id))}>
                    <ABtn variant="danger">Yes, delete</ABtn>
                  </form>
                  <Link
                    href={`/admin/programs/${id}?lesson=${selLesson.id}`}
                    className="underline"
                  >
                    Keep it
                  </Link>
                </div>
              ) : null}
              <LessonForm
                key={String(selLesson.id)}
                programId={id}
                sectionId={selWeek.id}
                lesson={selLesson}
                canEdit={canEdit}
              />
              {canEdit ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                  <form action={duplicateLesson.bind(null, id, String(selLesson.id))}>
                    <ABtn variant="ghost">Clone lesson</ABtn>
                  </form>
                  <Link
                    href={`/admin/programs/${id}?lesson=${selLesson.id}&confirm=delete`}
                    className="inline-flex min-h-10 items-center rounded-xl border-2 border-danger px-4 text-sm font-bold text-danger"
                  >
                    Delete lesson
                  </Link>
                </div>
              ) : null}
            </Panel>
          ) : null}
        </section>
      </div>
    </>
  );
}

function Menu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="relative">
      <summary
        aria-label={label}
        className="grid size-9 cursor-pointer list-none place-items-center rounded-lg text-lg text-muted hover:bg-page [&::-webkit-details-marker]:hidden"
      >
        ⋯
      </summary>
      <div className="absolute right-0 top-9 z-20 flex min-w-40 flex-col rounded-xl border border-line bg-surface p-1 shadow-lg">
        {children}
      </div>
    </details>
  );
}
const mi =
  "flex min-h-10 w-full items-center rounded-lg px-3 text-left text-sm font-bold text-brand hover:bg-page";

function LessonForm({
  programId,
  sectionId,
  lesson,
  canEdit,
}: {
  programId: string;
  sectionId: string;
  lesson: Record<string, string | number | boolean | null>;
  canEdit: boolean;
}) {
  const v = (k: string) => (lesson[k] ?? "") as string | number;
  const lid = String(lesson.id);
  const thumbId = `thumb-${lid}`;
  const thumb = lesson.thumbnail_path ? coverUrl(String(lesson.thumbnail_path)) : null;
  return (
    <form
      action={saveLesson.bind(null, programId, sectionId, lid)}
      className="grid gap-3 md:grid-cols-2"
      encType="multipart/form-data"
    >
      <input type="hidden" name="order_index" value={String(v("order_index") || 0)} />
      <label className={`${lab} md:col-span-2`}>
        Lesson name
        <input name="title" defaultValue={v("title")} required className={aInput} />
      </label>
      <div className="md:col-span-2">
        <VideoUploader
          lessonId={lid}
          hasVideo={Boolean(lesson.video_key)}
          canEdit={canEdit}
        />
      </div>
      <div className={`${lab} md:col-span-2`}>
        Thumbnail
        <div className="mt-1 grid gap-3 md:grid-cols-2">
          <LessonPreview
            lessonId={lid}
            hasVideo={Boolean(lesson.video_key)}
            inputId={thumbId}
          />
          <div className="flex flex-col gap-2">
            {thumb ? (
              <img
                src={thumb}
                alt="Current thumbnail"
                className="aspect-video w-full rounded-xl object-cover"
              />
            ) : (
              <span className="grid aspect-video w-full place-items-center rounded-xl border border-dashed border-line text-xs font-normal text-muted">
                No thumbnail yet
              </span>
            )}
            <ImageInput name="thumbnail" id={thumbId} />
            {thumb ? (
              <label className="flex items-center gap-2 text-xs font-normal">
                <input
                  type="checkbox"
                  name="remove_thumbnail"
                  className="size-4 accent-brand"
                />
                Remove the current thumbnail
              </label>
            ) : null}
            <span className="text-xs font-normal text-muted">
              Upload an image, or use a frame from the video. Shown before the video
              plays.
            </span>
          </div>
        </div>
      </div>
      <label className={lab}>
        Type
        <select
          name="content_type"
          defaultValue={String(v("content_type") || "workout")}
          className={aInput}
        >
          {["workout", "lesson", "guide", "replay", "challenge"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className={lab}>
        Duration (minutes)
        <input
          name="duration_minutes"
          type="number"
          defaultValue={v("duration_minutes")}
          className={aInput}
        />
      </label>
      <label className={`${lab} md:col-span-2`}>
        Short objective
        <input name="summary" defaultValue={v("summary")} className={aInput} />
      </label>
      <label className={`${lab} md:col-span-2`}>
        Written instructions and coaching points
        <textarea
          name="instructions"
          defaultValue={v("instructions")}
          rows={5}
          className={`${aInput} py-2`}
        />
      </label>
      <label className={lab}>
        Equipment
        <input name="equipment" defaultValue={v("equipment")} className={aInput} />
      </label>
      <label className={lab}>
        Access for this lesson
        <select
          name="access_override"
          defaultValue={String(v("access_override"))}
          className={aInput}
        >
          <option value="">Same as the program</option>
          {ACCESS.map(([val, l]) => (
            <option key={val} value={val}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className={`${lab} md:col-span-2`}>
        Safety note
        <input name="safety_notes" defaultValue={v("safety_notes")} className={aInput} />
      </label>
      <label className={`${lab} md:col-span-2`}>
        Downloadable guide (PDF, under 4 MB)
        <input
          type="file"
          name="resource"
          accept="application/pdf,image/*"
          className="mt-1 block text-sm"
        />
        {lesson.resource_path ? (
          <span className="text-xs font-normal text-muted">
            A file is attached. Uploading replaces it.
          </span>
        ) : null}
      </label>
      {canEdit ? (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3 md:col-span-2">
          <button
            name="intent"
            value="save"
            className="min-h-11 rounded-button border-2 border-line px-5 text-sm font-bold text-brand"
          >
            Save
          </button>
          {lesson.published ? (
            <button
              name="intent"
              value="unpublish"
              className="min-h-11 rounded-button border-2 border-line px-5 text-sm font-bold text-brand"
            >
              Save and unpublish
            </button>
          ) : (
            <button
              name="intent"
              value="publish"
              className="min-h-11 rounded-button bg-accent px-5 text-sm font-bold text-on-accent"
            >
              Save and publish
            </button>
          )}
        </div>
      ) : null}
    </form>
  );
}
