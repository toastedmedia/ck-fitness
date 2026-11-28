import type { Metadata } from "next";
import Link from "next/link";
import {
  CRM_SOURCES,
  CRM_STAGES,
  dayKey,
  sourceLabel,
  stageLabel,
  timeLabel,
  zonedTime,
} from "@ck/core";
import {
  ABtn,
  Flash,
  H1,
  Panel,
  Status,
  Table,
  Tile,
  aInput,
  td,
} from "@/components/admin/ui";
import { AutoSubmitSelect } from "@/components/admin/AutoSubmit";
import { requireStaff } from "@/lib/admin";
import { CRM_ROLES, contactName, type ContactRow } from "@/lib/leads";
import { changeStage, createContact } from "./actions";

export const metadata: Metadata = { title: "Leads" };

const TZ = "America/Vancouver";
const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
  });
const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
const digits = (p: string | null) => (p ?? "").replace(/\D/g, "");
const STAGE_TONE: Record<string, "ok" | "warn" | "bad" | "mute"> = {
  new: "warn",
  contacted: "mute",
  consult_booked: "ok",
  consult_done: "ok",
  client: "ok",
  lost: "bad",
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    q?: string;
    tag?: string;
    source?: string;
    stage?: string;
    error?: string;
    deleted?: string;
    add?: string;
  }>;
}) {
  const sp = await searchParams;
  const { db } = await requireStaff([...CRM_ROLES]);
  const view = sp.view === "list" ? "list" : "board";
  const { data, error } = await db
    .from("crm_contacts")
    .select("*")
    .order("last_activity_at", { ascending: false })
    .limit(2000);
  const all = (data ?? []) as ContactRow[];
  const [tagRows, mapRows, bookingRows, taskRows] = await Promise.all([
    db.from("member_tags").select("id, name").order("name"),
    db.from("crm_contact_tags").select("contact_id, tag_id"),
    db
      .from("bookings")
      .select("contact_id, starts_at")
      .eq("status", "booked")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at"),
    db.from("crm_tasks").select("contact_id, due_at").is("done_at", null),
  ]);
  const tags = (tagRows.data ?? []) as { id: string; name: string }[];
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const tagsOf = new Map<string, string[]>();
  for (const m of (mapRows.data ?? []) as { contact_id: string; tag_id: string }[]) {
    const n = tagName.get(m.tag_id);
    if (n) tagsOf.set(m.contact_id, [...(tagsOf.get(m.contact_id) ?? []), n]);
  }
  const nextConsult = new Map<string, string>();
  for (const b of (bookingRows.data ?? []) as {
    contact_id: string | null;
    starts_at: string;
  }[])
    if (b.contact_id && !nextConsult.has(b.contact_id))
      nextConsult.set(b.contact_id, b.starts_at);
  const tasksDue = new Map<string, number>();
  const endToday = zonedTime(dayKey(new Date(), TZ), "23:59", TZ);
  for (const t of (taskRows.data ?? []) as {
    contact_id: string;
    due_at: string | null;
  }[])
    if (t.due_at && new Date(t.due_at) <= endToday)
      tasksDue.set(t.contact_id, (tasksDue.get(t.contact_id) ?? 0) + 1);

  const q = (sp.q ?? "").trim().toLowerCase();
  const tagFilter = tags.find((t) => t.id === sp.tag)?.name;
  const list = all.filter(
    (c) =>
      (!q ||
        contactName(c).toLowerCase().includes(q) ||
        (c.email ?? "").includes(q) ||
        digits(c.phone).includes(q.replace(/\D/g, "") || "§")) &&
      (!tagFilter || (tagsOf.get(c.id) ?? []).includes(tagFilter)) &&
      (!sp.source || c.source === sp.source) &&
      (view === "board" || !sp.stage || c.stage === sp.stage),
  );
  const weekAgo = Date.now() - 7 * 86400000;
  const here = `/admin/leads?${new URLSearchParams(
    Object.entries({
      view,
      q: sp.q ?? "",
      tag: sp.tag ?? "",
      source: sp.source ?? "",
      stage: sp.stage ?? "",
    }).filter(([, v]) => v),
  ).toString()}`;

  const card = (c: ContactRow) => (
    <li key={c.id} className="rounded-card border border-line bg-surface p-3 shadow-sm">
      <Link
        href={`/admin/leads/${c.id}`}
        className="block font-bold text-brand underline-offset-2 hover:underline"
      >
        {contactName(c)}
      </Link>
      <p className="mt-0.5 text-xs text-muted">
        {sourceLabel(c.source)} · {ago(c.last_activity_at)}
      </p>
      {nextConsult.has(c.id) ? (
        <p className="mt-1 text-xs font-bold text-success">
          Consult {shortDay(nextConsult.get(c.id)!)}, {timeLabel(nextConsult.get(c.id)!)}
        </p>
      ) : null}
      {tasksDue.get(c.id) ? (
        <p className="mt-1 text-xs font-bold text-danger">Follow-up due</p>
      ) : null}
      {(tagsOf.get(c.id) ?? []).length ? (
        <p className="mt-1.5 flex flex-wrap gap-1">
          {(tagsOf.get(c.id) ?? []).map((t) => (
            <span
              key={t}
              className="rounded-full bg-page px-2 py-0.5 text-[11px] font-semibold text-brand"
            >
              {t}
            </span>
          ))}
        </p>
      ) : null}
      <div className="mt-2 flex items-center gap-1.5">
        {c.phone ? (
          <>
            <a
              href={`tel:${c.phone}`}
              className="inline-flex min-h-9 items-center rounded-button border-2 border-line px-2.5 text-xs font-bold text-brand"
            >
              Call
            </a>
            <a
              href={`https://wa.me/${digits(c.phone)}`}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-9 items-center rounded-button border-2 border-line px-2.5 text-xs font-bold text-brand"
            >
              WhatsApp
            </a>
          </>
        ) : null}
        <form action={changeStage.bind(null, c.id)} className="ml-auto">
          <input type="hidden" name="back" value={here} />
          <label className="sr-only" htmlFor={`st-${c.id}`}>
            Stage for {contactName(c)}
          </label>
          <AutoSubmitSelect
            id={`st-${c.id}`}
            name="stage"
            defaultValue={c.stage}
            className="min-h-9 max-w-[9.5rem] rounded-lg border-2 border-line bg-surface px-1.5 text-xs font-semibold"
          >
            {CRM_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </AutoSubmitSelect>
          <noscript>
            <button className="ml-1 text-xs font-bold underline">Save</button>
          </noscript>
        </form>
      </div>
    </li>
  );

  return (
    <>
      <H1
        right={
          <div className="flex gap-2">
            <Link
              href="/admin/calendar"
              className="inline-flex min-h-10 items-center rounded-button border-2 border-line px-4 text-xs font-bold text-brand"
            >
              Calendar
            </Link>
            <a
              href="#add"
              className="inline-flex min-h-10 items-center rounded-button bg-brand px-4 text-xs font-bold text-on-brand"
            >
              + Add contact
            </a>
          </div>
        }
      >
        Leads
      </H1>
      <p className="text-sm text-muted">
        Everyone who booked a consultation or messaged us, and where they are. Website
        bookings land here on their own. Change a stage with the dropdown on each card.
      </p>
      {error ? (
        <Flash bad>Leads are not ready yet. Run the latest database update (0036).</Flash>
      ) : null}
      {sp.deleted ? <Flash>Contact deleted.</Flash> : null}
      {sp.error ? (
        <Flash bad>
          {sp.error === "email"
            ? "That email address does not look right."
            : sp.error === "name"
              ? "Add at least a first name or an email."
              : "Could not save. Try again."}
        </Flash>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          value={all.filter((c) => new Date(c.created_at).getTime() > weekAgo).length}
          label="New in the last 7 days"
        />
        <Tile value={nextConsult.size} label="Upcoming consultations" />
        <Tile
          value={[...tasksDue.values()].reduce((a, b) => a + b, 0)}
          label="Follow-ups due today"
        />
        <Tile value={all.filter((c) => c.stage === "client").length} label="Clients" />
      </div>

      <form className="flex flex-wrap items-end gap-2" action="/admin/leads">
        <input type="hidden" name="view" value={view} />
        <label className="min-w-0 flex-1 text-xs font-bold text-brand">
          Search
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Name, email or phone"
            className={`${aInput} mt-1 font-normal`}
          />
        </label>
        <label className="text-xs font-bold text-brand">
          Tag
          <select
            name="tag"
            defaultValue={sp.tag ?? ""}
            className={`${aInput} mt-1 font-normal`}
          >
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-brand">
          Source
          <select
            name="source"
            defaultValue={sp.source ?? ""}
            className={`${aInput} mt-1 font-normal`}
          >
            <option value="">All sources</option>
            {CRM_SOURCES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {view === "list" ? (
          <label className="text-xs font-bold text-brand">
            Stage
            <select
              name="stage"
              defaultValue={sp.stage ?? ""}
              className={`${aInput} mt-1 font-normal`}
            >
              <option value="">All stages</option>
              {CRM_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <ABtn variant="primary">Filter</ABtn>
      </form>

      <div className="flex gap-1 text-sm" role="tablist" aria-label="View">
        {(["board", "list"] as const).map((v) => (
          <Link
            key={v}
            href={`/admin/leads?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.tag ? { tag: sp.tag } : {}), ...(sp.source ? { source: sp.source } : {}), view: v }).toString()}`}
            aria-current={view === v ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 font-bold ${view === v ? "bg-brand text-on-brand" : "border-2 border-line text-brand"}`}
          >
            {v === "board" ? "Pipeline" : "List"}
          </Link>
        ))}
        <span className="ml-auto self-center text-xs text-muted">
          {list.length} of {all.length} contacts
        </span>
      </div>

      {view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          <div className="flex snap-x snap-mandatory gap-3">
            {CRM_STAGES.map((s) => {
              const col = list.filter((c) => c.stage === s.key);
              return (
                <section
                  key={s.key}
                  className="w-[82vw] max-w-[300px] shrink-0 snap-start rounded-card bg-page p-2 sm:w-[270px]"
                  aria-label={s.label}
                >
                  <h2 className="flex items-center justify-between px-1 pb-2 text-sm font-bold text-brand">
                    {s.label}
                    <span className="rounded-full bg-surface px-2 text-xs text-muted">
                      {col.length}
                    </span>
                  </h2>
                  <ul className="grid gap-2">
                    {col.slice(0, 100).map(card)}
                    {col.length > 100 ? (
                      <li className="px-1 text-xs text-muted">
                        +{col.length - 100} more. Use search or the List view.
                      </li>
                    ) : null}
                    {!col.length ? (
                      <li className="px-1 py-3 text-xs text-muted">No one here yet.</li>
                    ) : null}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <Panel>
          <Table head={["Name", "Stage", "Source", "Phone", "Tags", "Last activity"]}>
            {list.slice(0, 500).map((c) => (
              <tr key={c.id}>
                <td className={td}>
                  <Link
                    href={`/admin/leads/${c.id}`}
                    className="font-bold text-brand underline"
                  >
                    {contactName(c)}
                  </Link>
                  <span className="block text-xs text-muted">{c.email}</span>
                </td>
                <td className={td}>
                  <Status tone={STAGE_TONE[c.stage] ?? "mute"}>
                    {stageLabel(c.stage)}
                  </Status>
                </td>
                <td className={td}>{sourceLabel(c.source)}</td>
                <td className={td}>
                  {c.phone ? (
                    <a className="underline" href={`tel:${c.phone}`}>
                      {c.phone}
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                <td className={td}>{(tagsOf.get(c.id) ?? []).join(", ") || "-"}</td>
                <td className={td}>{ago(c.last_activity_at)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}

      <Panel title="Add a contact" className="scroll-mt-20">
        <form id="add" action={createContact} className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-bold text-brand">
            First name
            <input
              name="first_name"
              maxLength={80}
              className={`${aInput} mt-1 font-normal`}
            />
          </label>
          <label className="text-xs font-bold text-brand">
            Last name
            <input
              name="last_name"
              maxLength={80}
              className={`${aInput} mt-1 font-normal`}
            />
          </label>
          <label className="text-xs font-bold text-brand">
            Phone
            <input
              name="phone"
              type="tel"
              maxLength={40}
              className={`${aInput} mt-1 font-normal`}
            />
          </label>
          <label className="text-xs font-bold text-brand">
            Email (optional)
            <input
              name="email"
              type="email"
              maxLength={200}
              className={`${aInput} mt-1 font-normal`}
            />
          </label>
          <label className="text-xs font-bold text-brand">
            Where they came from
            <select
              name="source"
              defaultValue="instagram"
              className={`${aInput} mt-1 font-normal`}
            >
              {CRM_SOURCES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-brand">
            Goal (optional)
            <input
              name="goal"
              maxLength={1000}
              className={`${aInput} mt-1 font-normal`}
            />
          </label>
          <label className="text-xs font-bold text-brand md:col-span-2">
            First note (optional)
            <textarea
              name="note"
              rows={2}
              maxLength={4000}
              className={`${aInput} mt-1 py-2 font-normal`}
            />
          </label>
          <div className="md:col-span-2">
            <ABtn variant="primary">Add contact</ABtn>
          </div>
        </form>
      </Panel>
    </>
  );
}
