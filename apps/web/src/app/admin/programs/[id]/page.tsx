/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ABtn, Flash, H1, Panel, Status, aInput } from "@/components/admin/ui";
import { VideoUploader } from "@/components/admin/VideoUploader";
import { CONTENT, requireStaff } from "@/lib/admin";
import { coverUrl } from "@/lib/programs";
import {
  addSection,
  deleteLesson,
  deleteSection,
  duplicateLesson,
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
    resource: "Resource must be a PDF or image under 20 MB.",
    save: "That did not save. Please try again.",
    section: "Please enter a section title.",
    lesson: "Please enter a lesson title.",
  };

  return (
    <>
      <H1
        right={
          <div className="flex items-center gap-2">
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

      <Panel title="Publish">
        <p className="text-sm text-muted">
          Workflow: edit as draft, preview as Free and Member, then publish. Unpublish
          hides it at once, with no deployment.
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
                <input type="checkbox" name="notify" className="size-4 accent-brand" />{" "}
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
            <input name="title" defaultValue={p.title} required className={aInput} />
          </label>
          <label className={lab}>
            Web address (slug)
            <input name="slug" defaultValue={p.slug} className={aInput} />
          </label>
          <label className={lab}>
            Access
            <select name="access_level" defaultValue={p.access_level} className={aInput}>
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
            <span className={lab}>Cover image (JPG, PNG or WebP, under 2 MB)</span>
            {cover ? (
              <img src={cover} alt="" className="my-2 h-24 rounded-xl object-cover" />
            ) : null}
            <input
              type="file"
              name="cover"
              accept="image/jpeg,image/png,image/webp"
              className="mt-1 block text-sm"
            />
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

      {secs.map((s) => (
        <Panel key={s.id} title={`${s.title}`}>
          <form
            action={updateSection.bind(null, id, s.id)}
            className="flex flex-wrap items-end gap-2"
          >
            <label className={`${lab} min-w-48 flex-1`}>
              Section title
              <input name="title" defaultValue={s.title} className={aInput} />
            </label>
            <label className={`${lab} w-24`}>
              Order
              <input
                name="order_index"
                type="number"
                defaultValue={s.order_index}
                className={aInput}
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                name="published"
                defaultChecked={s.published}
                className="size-4 accent-brand"
              />
              Visible
            </label>
            {canEdit ? (
              <>
                <ABtn variant="ghost">Save section</ABtn>
              </>
            ) : null}
          </form>
          {canEdit ? (
            <form action={deleteSection.bind(null, id, s.id)} className="mt-2">
              <ABtn variant="danger">Delete section and its lessons</ABtn>
            </form>
          ) : null}

          <div className="mt-3 flex flex-col gap-3">
            {((lessons ?? []) as Record<string, string | number | boolean | null>[])
              .filter((l) => l.section_id === s.id)
              .map((l) => (
                <details key={String(l.id)} className="rounded-xl border border-line p-3">
                  <summary className="cursor-pointer text-sm font-bold text-brand">
                    {String(l.title)}{" "}
                    <span className="font-normal text-muted">
                      · {l.published ? "published" : "hidden"}
                      {l.video_key ? " · video attached" : ""}
                    </span>
                  </summary>
                  <LessonForm
                    programId={id}
                    sectionId={s.id}
                    lesson={l}
                    canEdit={canEdit}
                  />
                  {canEdit ? (
                    <div className="mt-2 flex gap-2">
                      <form action={duplicateLesson.bind(null, id, String(l.id))}>
                        <ABtn variant="ghost">Duplicate</ABtn>
                      </form>
                      <form action={deleteLesson.bind(null, id, String(l.id))}>
                        <ABtn variant="danger">Delete</ABtn>
                      </form>
                    </div>
                  ) : null}
                </details>
              ))}
            {canEdit ? (
              <details className="rounded-xl border-2 border-dashed border-line p-3">
                <summary className="cursor-pointer text-sm font-bold text-brand">
                  Add a lesson
                </summary>
                <LessonForm programId={id} sectionId={s.id} lesson={null} canEdit />
              </details>
            ) : null}
          </div>
        </Panel>
      ))}

      {canEdit ? (
        <Panel title="Add a week, phase or module">
          <form
            action={addSection.bind(null, id)}
            className="flex flex-wrap items-end gap-2"
          >
            <label className={`${lab} min-w-48 flex-1`}>
              Title
              <input name="title" required className={aInput} placeholder="Week 1" />
            </label>
            <label className={lab}>
              Type
              <select name="section_type" className={aInput}>
                <option value="week">Week</option>
                <option value="phase">Phase</option>
                <option value="module">Module</option>
              </select>
            </label>
            <ABtn variant="primary">Add</ABtn>
          </form>
        </Panel>
      ) : null}
    </>
  );
}

function LessonForm({
  programId,
  sectionId,
  lesson,
  canEdit,
}: {
  programId: string;
  sectionId: string;
  lesson: Record<string, string | number | boolean | null> | null;
  canEdit: boolean;
}) {
  const v = (k: string) => (lesson?.[k] ?? "") as string | number;
  return (
    <form
      action={saveLesson.bind(
        null,
        programId,
        sectionId,
        lesson ? String(lesson.id) : "new",
      )}
      className="mt-3 grid gap-3 md:grid-cols-2"
      encType="multipart/form-data"
    >
      <label className={`${lab} md:col-span-2`}>
        Lesson title
        <input name="title" defaultValue={v("title")} required className={aInput} />
      </label>
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
          rows={4}
          className={`${aInput} py-2`}
        />
      </label>
      <label className={lab}>
        Equipment
        <input name="equipment" defaultValue={v("equipment")} className={aInput} />
      </label>
      {lesson ? (
        <VideoUploader
          lessonId={String(lesson.id)}
          hasVideo={Boolean(lesson.video_key)}
          canEdit={canEdit}
        />
      ) : (
        <p className="text-xs text-muted md:col-span-2">
          Save the lesson first, then you can upload its video and thumbnail.
        </p>
      )}
      <div className={`${lab} md:col-span-2`}>
        Thumbnail (JPG, PNG or WebP under 2 MB)
        {lesson?.thumbnail_path ? (
          <img
            src={coverUrl(String(lesson.thumbnail_path)) ?? ""}
            alt=""
            className="my-2 h-24 rounded-xl object-cover"
          />
        ) : null}
        <input
          type="file"
          name="thumbnail"
          accept="image/jpeg,image/png,image/webp"
          className="mt-1 block text-sm"
        />
        {lesson?.thumbnail_path ? (
          <label className="mt-1 flex items-center gap-2 text-xs font-normal">
            <input
              type="checkbox"
              name="remove_thumbnail"
              className="size-4 accent-brand"
            />
            Remove the current thumbnail
          </label>
        ) : (
          <span className="text-xs font-normal text-muted">
            Shown on the video before it plays. Uploading replaces it.
          </span>
        )}
      </div>
      <label className={`${lab} md:col-span-2`}>
        Safety note
        <input name="safety_notes" defaultValue={v("safety_notes")} className={aInput} />
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
      <label className={lab}>
        Order
        <input
          name="order_index"
          type="number"
          defaultValue={v("order_index") || 0}
          className={aInput}
        />
      </label>
      <label className={lab}>
        Downloadable guide (PDF)
        <input
          type="file"
          name="resource"
          accept="application/pdf,image/*"
          className="mt-1 block text-sm"
        />
        {lesson?.resource_path ? (
          <span className="text-xs text-muted">
            A file is attached. Uploading replaces it.
          </span>
        ) : null}
      </label>
      <label className="flex items-center gap-2 pt-5 text-sm">
        <input
          type="checkbox"
          name="published"
          defaultChecked={lesson ? Boolean(lesson.published) : true}
          className="size-4 accent-brand"
        />
        Published
      </label>
      {canEdit ? (
        <div className="md:col-span-2">
          <ABtn variant="primary">{lesson ? "Save lesson" : "Add lesson"}</ABtn>
        </div>
      ) : null}
    </form>
  );
}
