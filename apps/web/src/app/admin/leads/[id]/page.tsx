import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ACTIVITY_KINDS,
  CRM_SOURCES,
  CRM_STAGES,
  leadEmailable,
  sourceLabel,
  stageLabel,
} from "@ck/core";
import { ABtn, Flash, H1, Panel, Status, aInput } from "@/components/admin/ui";
import { AutoSubmitSelect } from "@/components/admin/AutoSubmit";
import { requireStaff } from "@/lib/admin";
import { whenText } from "@/lib/bookings";
import { CRM_ROLES, contactName, type ContactRow } from "@/lib/leads";
import {
  addActivity,
  addContactTag,
  addTask,
  changeStage,
  deleteActivity,
  deleteContact,
  removeContactTag,
  setEmailPermission,
  stopAutomationRun,
  toggleTask,
  updateContact,
} from "../actions";

export const metadata: Metadata = { title: "Contact" };

const TZ = "America/Vancouver";
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const KIND_LABEL: Record<string, string> = {
  ...Object.fromEntries(ACTIVITY_KINDS.map((k) => [k.key, k.label])),
  stage: "Stage",
  booking: "Booking",
  edit: "Edited",
  sent: "Email sent",
};
const digits = (p: string | null) => (p ?? "").replace(/\D/g, "");

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { db } = await requireStaff([...CRM_ROLES]);
  const { data } = await db.from("crm_contacts").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const c = data as ContactRow;
  const [acts, tasks, books, myTags, allTags, runs] = await Promise.all([
    db
      .from("crm_activities")
      .select("id, kind, body, created_at, created_by")
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("crm_tasks")
      .select("*")
      .eq("contact_id", id)
      .order("done_at", { nullsFirst: true })
      .order("due_at"),
    db
      .from("bookings")
      .select("*")
      .eq("contact_id", id)
      .order("starts_at", { ascending: false }),
    db.from("crm_contact_tags").select("tag_id").eq("contact_id", id),
    db.from("member_tags").select("id, name").order("name"),
    db
      .from("crm_automation_runs")
      .select("automation_id, step, status, stop_reason, next_at, crm_automations(name)")
      .eq("contact_id", id),
  ]);
  const tagList = (allTags.data ?? []) as { id: string; name: string }[];
  const mine = new Set(
    ((myTags.data ?? []) as { tag_id: string }[]).map((t) => t.tag_id),
  );
  const staffIds = [
    ...new Set(
      ((acts.data ?? []) as { created_by: string | null }[])
        .map((a) => a.created_by)
        .filter(Boolean),
    ),
  ] as string[];
  const { data: staffNames } = staffIds.length
    ? await db.from("profiles").select("user_id, first_name").in("user_id", staffIds)
    : { data: [] };
  const who = new Map(
    ((staffNames ?? []) as { user_id: string; first_name: string | null }[]).map((p) => [
      p.user_id,
      p.first_name ?? "Team",
    ]),
  );
  const name = contactName(c);
  const field = `${aInput} mt-1 font-normal`;

  return (
    <>
      <Link href="/admin/leads" className="text-sm font-bold text-brand underline">
        ← All leads
      </Link>
      <H1
        right={
          <Status tone={c.stage === "lost" ? "bad" : c.stage === "new" ? "warn" : "ok"}>
            {stageLabel(c.stage)}
          </Status>
        }
      >
        {name}
      </H1>
      <p className="text-sm text-muted">
        {sourceLabel(c.source)} · added {stamp(c.created_at)}
        {Object.keys(c.utm ?? {}).length
          ? ` · ${Object.entries(c.utm)
              .filter(([k]) => k.startsWith("utm_"))
              .map(([, v]) => v)
              .join(" / ")}`
          : ""}
        {c.email_consent_at ? " · said yes to tips and offers by email" : ""}
      </p>
      {sp.saved ? <Flash>Saved.</Flash> : null}
      {sp.error ? (
        <Flash bad>
          {sp.error === "email"
            ? "That email address does not look right."
            : sp.error === "duplicate"
              ? "Another contact already has this email."
              : sp.error === "confirm"
                ? "Type DELETE in capitals to delete."
                : "Could not save. Try again."}
        </Flash>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {c.phone ? (
          <>
            <a
              href={`tel:${c.phone}`}
              className="inline-flex min-h-11 items-center rounded-button bg-brand px-4 text-sm font-bold text-on-brand"
            >
              Call {c.phone}
            </a>
            <a
              href={`https://wa.me/${digits(c.phone)}?text=${encodeURIComponent(`Hi ${c.first_name || "there"}, this is Chanveer from Chardikala Fitness.`)}`}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-11 items-center rounded-button border-2 border-line px-4 text-sm font-bold text-brand"
            >
              WhatsApp
            </a>
          </>
        ) : null}
        {c.email ? (
          <a
            href={`mailto:${c.email}`}
            className="inline-flex min-h-11 items-center rounded-button border-2 border-line px-4 text-sm font-bold text-brand"
          >
            Email
          </a>
        ) : null}
        <Link
          href={`/admin/calendar?book=${c.id}#book`}
          className="inline-flex min-h-11 items-center rounded-button border-2 border-line px-4 text-sm font-bold text-brand"
        >
          Book a consult
        </Link>
        {c.user_id ? (
          <Link
            href={`/admin/users/${c.user_id}`}
            className="inline-flex min-h-11 items-center rounded-button border-2 border-line px-4 text-sm font-bold text-brand"
          >
            App account →
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="grid content-start gap-4">
          <Panel title="Stage">
            <form action={changeStage.bind(null, id)} className="flex flex-wrap gap-2">
              <label className="sr-only" htmlFor="stage">
                Stage
              </label>
              <AutoSubmitSelect
                id="stage"
                name="stage"
                defaultValue={c.stage}
                className={`${aInput} max-w-xs`}
              >
                {CRM_STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </AutoSubmitSelect>
              <noscript>
                <ABtn>Save</ABtn>
              </noscript>
            </form>
          </Panel>

          <Panel title="Tags">
            <div className="flex flex-wrap gap-1.5">
              {tagList
                .filter((t) => mine.has(t.id))
                .map((t) => (
                  <form key={t.id} action={removeContactTag.bind(null, id, t.id)}>
                    <button
                      className="inline-flex min-h-8 items-center gap-1 rounded-full bg-page px-3 text-xs font-bold text-brand"
                      aria-label={`Remove tag ${t.name}`}
                    >
                      {t.name} <span aria-hidden="true">×</span>
                    </button>
                  </form>
                ))}
              {!mine.size ? (
                <span className="text-xs text-muted">No tags yet.</span>
              ) : null}
            </div>
            <form action={addContactTag.bind(null, id)} className="mt-3 flex gap-2">
              <label className="sr-only" htmlFor="tag">
                Add a tag
              </label>
              <input
                id="tag"
                name="tag"
                list="tag-options"
                maxLength={30}
                required
                placeholder="Pick a tag or type a new one"
                className={aInput}
              />
              <datalist id="tag-options">
                {tagList
                  .filter((t) => !mine.has(t.id))
                  .map((t) => (
                    <option key={t.id} value={t.name} />
                  ))}
              </datalist>
              <ABtn variant="primary">Add</ABtn>
            </form>
            <p className="mt-1 text-xs text-muted">
              Same tags as Admin → Users, so a tag means the same thing everywhere.
            </p>
          </Panel>

          <Panel title="Email">
            <p className="text-sm">
              {!c.email ? (
                "No email address."
              ) : leadEmailable(c) ? (
                <>
                  <Status tone="ok">Can get marketing emails</Status>{" "}
                  <span className="text-xs text-muted">
                    {c.email_consent_at
                      ? `Agreed ${stamp(c.email_consent_at)}`
                      : `Implied permission until ${stamp(c.implied_consent_until!)}`}
                    {c.consent_note ? ` · ${c.consent_note}` : ""}
                  </span>
                </>
              ) : c.unsubscribed_at ? (
                <>
                  <Status tone="bad">Unsubscribed</Status>{" "}
                  <span className="text-xs text-muted">{stamp(c.unsubscribed_at)}</span>
                </>
              ) : (
                <>
                  <Status tone="warn">No permission yet</Status>{" "}
                  <span className="text-xs text-muted">
                    Campaigns and automations skip them.
                  </span>
                </>
              )}
            </p>
            {c.email ? (
              <form
                action={setEmailPermission.bind(null, id)}
                className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
              >
                <label className="sr-only" htmlFor="permission">
                  Email permission
                </label>
                <select
                  id="permission"
                  name="permission"
                  className={aInput}
                  defaultValue="express"
                >
                  <option value="express">They agreed to get our emails</option>
                  <option value="enquiry">
                    They asked about our services (6 months)
                  </option>
                  <option value="customer">They are a client (2 years)</option>
                  <option value="unsubscribe">
                    Stop all marketing emails (unsubscribe)
                  </option>
                </select>
                <ABtn>Save</ABtn>
                <label className="sr-only" htmlFor="pnote">
                  How (optional)
                </label>
                <input
                  id="pnote"
                  name="note"
                  maxLength={200}
                  placeholder="How (optional): e.g. said yes on WhatsApp 3 Dec"
                  className={`${aInput} sm:col-span-2`}
                />
              </form>
            ) : null}
            {(
              (runs.data ?? []) as unknown as {
                automation_id: string;
                step: number;
                status: string;
                stop_reason: string | null;
                next_at: string | null;
                crm_automations: { name: string } | null;
              }[]
            ).length ? (
              <ul className="mt-3 grid gap-1.5 text-sm">
                {(
                  (runs.data ?? []) as unknown as {
                    automation_id: string;
                    step: number;
                    status: string;
                    stop_reason: string | null;
                    next_at: string | null;
                    crm_automations: { name: string } | null;
                  }[]
                ).map((r) => (
                  <li key={r.automation_id} className="flex flex-wrap items-center gap-2">
                    <b>{r.crm_automations?.name ?? "Automation"}</b>
                    <span className="text-xs text-muted">
                      {r.status === "active"
                        ? `next email ${r.next_at ? stamp(r.next_at) : "soon"}`
                        : r.status === "done"
                          ? "finished"
                          : `stopped${r.stop_reason ? `: ${r.stop_reason}` : ""}`}
                    </span>
                    {r.status === "active" ? (
                      <form action={stopAutomationRun.bind(null, id, r.automation_id)}>
                        <button className="text-xs text-danger underline">Stop</button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>

          <Panel title="Follow-ups">
            <ul className="grid gap-2">
              {(
                (tasks.data ?? []) as {
                  id: string;
                  title: string;
                  due_at: string | null;
                  done_at: string | null;
                }[]
              ).map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <form action={toggleTask.bind(null, id, t.id, !t.done_at)}>
                    <button
                      aria-label={
                        t.done_at
                          ? `Mark "${t.title}" not done`
                          : `Mark "${t.title}" done`
                      }
                      className={`grid h-7 w-7 place-items-center rounded-md border-2 ${t.done_at ? "border-success bg-success text-white" : "border-line"}`}
                    >
                      {t.done_at ? "✓" : ""}
                    </button>
                  </form>
                  <span
                    className={`text-sm ${t.done_at ? "text-muted line-through" : ""}`}
                  >
                    {t.title}
                    {t.due_at ? (
                      <span
                        className={`ml-1 text-xs ${!t.done_at && new Date(t.due_at).getTime() < Date.now() ? "font-bold text-danger" : "text-muted"}`}
                      >
                        ·{" "}
                        {new Date(t.due_at).toLocaleDateString("en-CA", {
                          timeZone: TZ,
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
              {!(tasks.data ?? []).length ? (
                <li className="text-xs text-muted">Nothing to follow up.</li>
              ) : null}
            </ul>
            <form
              action={addTask.bind(null, id)}
              className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
            >
              <label className="sr-only" htmlFor="task">
                Follow-up
              </label>
              <input
                id="task"
                name="title"
                required
                maxLength={200}
                placeholder="e.g. Send the challenge link"
                className={aInput}
              />
              <label className="sr-only" htmlFor="due">
                Due
              </label>
              <input id="due" name="due" type="date" className={aInput} />
              <ABtn variant="primary">Add</ABtn>
            </form>
          </Panel>

          <Panel title="Consultations">
            <ul className="grid gap-2">
              {(
                (books.data ?? []) as {
                  id: string;
                  starts_at: string;
                  status: string;
                  goal: string;
                }[]
              ).map((b) => (
                <li key={b.id} className="text-sm">
                  <b>{whenText(b.starts_at)}</b>{" "}
                  <Status
                    tone={
                      b.status === "booked"
                        ? "ok"
                        : b.status === "completed"
                          ? "ok"
                          : b.status === "no_show"
                            ? "bad"
                            : "mute"
                    }
                  >
                    {{
                      booked: "Booked",
                      completed: "Done",
                      no_show: "No-show",
                      cancelled: "Cancelled",
                    }[b.status] ?? b.status}
                  </Status>
                  {b.goal ? (
                    <span className="block text-xs text-muted">Goal: {b.goal}</span>
                  ) : null}
                </li>
              ))}
              {!(books.data ?? []).length ? (
                <li className="text-xs text-muted">No consultations yet.</li>
              ) : null}
            </ul>
            <Link
              href="/admin/calendar"
              className="mt-2 inline-block text-xs font-bold text-brand underline"
            >
              Open the calendar
            </Link>
          </Panel>
        </div>

        <div className="grid content-start gap-4">
          <Panel title="Notes and activity">
            <form action={addActivity.bind(null, id)} className="grid gap-2">
              <div
                className="flex flex-wrap gap-1.5"
                role="radiogroup"
                aria-label="What happened"
              >
                {ACTIVITY_KINDS.map((k, i) => (
                  <label
                    key={k.key}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-full border-2 border-line px-3 py-1 text-xs font-bold text-brand has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-on-brand"
                  >
                    <input
                      type="radio"
                      name="kind"
                      value={k.key}
                      defaultChecked={i === 0}
                      className="sr-only"
                    />
                    {k.label}
                  </label>
                ))}
              </div>
              <label className="sr-only" htmlFor="body">
                Note
              </label>
              <textarea
                id="body"
                name="body"
                rows={3}
                required
                maxLength={4000}
                placeholder="What was said, what's next…"
                className={`${aInput} py-2`}
              />
              <div>
                <ABtn variant="primary">Save note</ABtn>
              </div>
            </form>
            <ol className="mt-4 grid gap-3 border-l-2 border-line pl-3">
              {(
                (acts.data ?? []) as {
                  id: string;
                  kind: string;
                  body: string;
                  created_at: string;
                  created_by: string | null;
                }[]
              ).map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="text-xs text-muted">
                    <b className="text-brand">{KIND_LABEL[a.kind] ?? a.kind}</b> ·{" "}
                    {stamp(a.created_at)}
                    {a.created_by ? ` · ${who.get(a.created_by) ?? "Team"}` : ""}
                  </p>
                  <p className="whitespace-pre-wrap">{a.body}</p>
                  {["note", "call", "whatsapp", "email", "meeting"].includes(a.kind) ? (
                    <form action={deleteActivity.bind(null, id, a.id)}>
                      <button className="text-[11px] text-muted underline">Delete</button>
                    </form>
                  ) : null}
                </li>
              ))}
              {!(acts.data ?? []).length ? (
                <li className="text-xs text-muted">Nothing yet.</li>
              ) : null}
            </ol>
          </Panel>

          <Panel title="Details">
            <form
              action={updateContact.bind(null, id)}
              className="grid gap-3 sm:grid-cols-2"
            >
              <label className="text-xs font-bold text-brand">
                First name
                <input
                  name="first_name"
                  defaultValue={c.first_name}
                  maxLength={80}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                Last name
                <input
                  name="last_name"
                  defaultValue={c.last_name}
                  maxLength={80}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                Phone
                <input
                  name="phone"
                  type="tel"
                  defaultValue={c.phone ?? ""}
                  maxLength={40}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                Email
                <input
                  name="email"
                  type="email"
                  defaultValue={c.email ?? ""}
                  maxLength={200}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                Source
                <select name="source" defaultValue={c.source} className={field}>
                  {CRM_SOURCES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-brand sm:col-span-2">
                Goal
                <textarea
                  name="goal"
                  defaultValue={c.goal ?? ""}
                  rows={2}
                  maxLength={1000}
                  className={`${field} py-2`}
                />
              </label>
              <div>
                <ABtn variant="primary">Save details</ABtn>
              </div>
            </form>
          </Panel>

          <details className="rounded-card border border-line bg-surface p-4">
            <summary className="cursor-pointer text-sm font-bold text-danger">
              Delete this contact
            </summary>
            <form
              action={deleteContact.bind(null, id)}
              className="mt-3 flex flex-wrap gap-2"
            >
              <label className="sr-only" htmlFor="confirm">
                Type DELETE
              </label>
              <input
                id="confirm"
                name="confirm"
                placeholder="Type DELETE"
                className={`${aInput} max-w-[12rem]`}
              />
              <ABtn variant="danger">Delete for good</ABtn>
            </form>
            <p className="mt-2 text-xs text-muted">
              Removes the contact, notes and follow-ups. Bookings stay in the calendar.
              Their app account is not touched.
            </p>
          </details>
        </div>
      </div>
    </>
  );
}
