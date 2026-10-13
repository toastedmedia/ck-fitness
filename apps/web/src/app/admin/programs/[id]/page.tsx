/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ABtn, Flash, H1, Panel, Status, aInput } from "@/components/admin/ui";
import { ImageInput } from "@/components/admin/ImageInput";
import { LessonPreview } from "@/components/admin/LessonPreview";
import { VideoUploader } from "@/components/admin/VideoUploader";
import { CONTENT, requireStaff } from "@/lib/admin";
import { coverUrl } from "@/lib/programs";
import {
  addSection,
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
  const { supabase, roles } = await requireStaff([...CONTENT, "coach"]);
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
  const view = selLesson ? "lesson" : selWeek ? "week" : "details";
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
          className={`rounded-card border border-line bg-surface p-2 ${view === "details" ? "" : "order-2 lg:order-none"}`}
          aria-label="Program outline"
        >
          <Link
            href={`/admin/programs/${id}`}
            className={`${row(view === "details")} min-h-11 px-2 text-sm font-extrabold text-brand`}
          >
            <span className="flex-1 truncate">{p.title}</span>
            <span className="text-[11px] font-bold text-muted">Details and publish</span>
          </Link>
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
