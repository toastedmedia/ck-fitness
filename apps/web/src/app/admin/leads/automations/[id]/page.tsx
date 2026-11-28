import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AUTOMATION_TRIGGERS,
  CRM_SOURCES,
  CRM_STAGES,
  type AutomationStep,
} from "@ck/core";
import { ABtn, Flash, H1, Panel, aInput } from "@/components/admin/ui";
import { requireStaff } from "@/lib/admin";
import type { AutomationRow } from "@/lib/automations";
import { CRM_ROLES } from "@/lib/leads";
import { deleteAutomation, enrollExisting, saveAutomation, testStep } from "../actions";

export const metadata: Metadata = { title: "Automation" };

const ERR: Record<string, string> = {
  trigger: "Choose when it starts.",
  tag: "Choose the tag.",
  stage: "Choose the stage.",
  steps: "Add at least one email with a subject and a message.",
  save: "Could not save. Try again.",
  inactive: "Switch the automation on and save first.",
  test: "The test email could not be sent.",
};

export default async function AutomationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string;
    error?: string;
    enrolled?: string;
    test?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { db } = await requireStaff([...CRM_ROLES]);
  let a: AutomationRow | null = null;
  if (id !== "new") {
    if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
    const { data } = await db
      .from("crm_automations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!data) notFound();
    a = data as AutomationRow;
  }
  const { data: tags } = await db.from("member_tags").select("id,name").order("name");
  const steps: Partial<AutomationStep>[] = [...(a?.steps ?? [])];
  while (steps.length < Math.max(5, (a?.steps?.length ?? 0) + 1) && steps.length < 10)
    steps.push({ delay_days: steps.length ? 3 : 0 });
  const field = `${aInput} mt-1 font-normal`;
  const t = a?.trigger_type ?? "tag_added";
  return (
    <>
      <Link
        href="/admin/leads/automations"
        className="text-sm font-bold text-brand underline"
      >
        ← All automations
      </Link>
      <H1>{a ? a.name : "New automation"}</H1>
      {sp.saved ? <Flash>Saved.</Flash> : null}
      {sp.enrolled ? (
        <Flash>
          {sp.enrolled} people already matching were added. Their emails go out within 15
          minutes.
        </Flash>
      ) : null}
      {sp.test ? <Flash>Test sent to {sp.test}.</Flash> : null}
      {sp.error ? <Flash bad>{ERR[sp.error] ?? "Something went wrong."}</Flash> : null}

      <form action={saveAutomation.bind(null, id)} className="grid gap-4">
        <Panel title="When it starts">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-brand sm:col-span-2">
              Name (only you see it)
              <input
                name="name"
                required
                maxLength={100}
                defaultValue={a?.name ?? ""}
                placeholder="Winter Challenge follow-up"
                className={field}
              />
            </label>
            <label className="text-xs font-bold text-brand">
              Start when
              <select name="trigger_type" defaultValue={t} className={field}>
                {AUTOMATION_TRIGGERS.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-brand">
              Which tag (for &quot;A tag is added&quot;)
              <select
                name="trigger_tag"
                defaultValue={t === "tag_added" ? a?.trigger_value : ""}
                className={field}
              >
                <option value="">Choose a tag</option>
                {((tags ?? []) as { id: string; name: string }[]).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-brand">
              Which stage (for &quot;Moves to a stage&quot;)
              <select
                name="trigger_stage"
                defaultValue={t === "stage" ? a?.trigger_value : ""}
                className={field}
              >
                <option value="">Choose a stage</option>
                {CRM_STAGES.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-brand">
              Which source (for &quot;A new lead arrives&quot;)
              <select
                name="trigger_source"
                defaultValue={t === "new_lead" ? a?.trigger_value : ""}
                className={field}
              >
                <option value="">Any source</option>
                {CRM_SOURCES.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="mt-3">
            <legend className="text-xs font-bold text-brand">
              Stop the emails when they reach
            </legend>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              {CRM_STAGES.map((x) => (
                <label key={x.key} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    name="stop_stage"
                    value={x.key}
                    defaultChecked={(a?.stop_stages ?? ["client", "lost"]).includes(
                      x.key,
                    )}
                    className="size-4 accent-brand"
                  />
                  {x.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="mt-3 flex items-center gap-2 text-sm font-bold text-brand">
            <input
              type="checkbox"
              name="active"
              defaultChecked={a?.active ?? false}
              className="size-5 accent-brand"
            />
            On (send emails)
          </label>
        </Panel>

        {steps.map((s, i) => (
          <Panel
            key={i}
            title={`Email ${i + 1}${i === 0 ? "" : " (leave the subject empty to skip)"}`}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-brand">
                {i === 0
                  ? "Days after they start (0 = straight away)"
                  : "Days after the previous email"}
                <input
                  type="number"
                  name={`s${i}_delay`}
                  min={0}
                  max={365}
                  defaultValue={s.delay_days ?? 0}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                Subject
                <input
                  name={`s${i}_subject`}
                  maxLength={150}
                  defaultValue={s.subject ?? ""}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand sm:col-span-2">
                Heading (optional, big text at the top)
                <input
                  name={`s${i}_heading`}
                  maxLength={150}
                  defaultValue={s.heading ?? ""}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand sm:col-span-2">
                Message ({"{{name}}"} = their first name; blank line = new paragraph;
                &quot;- &quot; = bullet)
                <textarea
                  name={`s${i}_body`}
                  rows={6}
                  maxLength={6000}
                  defaultValue={s.body ?? ""}
                  className={`${field} py-2`}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                Button text (optional)
                <input
                  name={`s${i}_cta_label`}
                  maxLength={40}
                  defaultValue={s.cta_label ?? ""}
                  placeholder="Book a free consultation"
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                Button link (https://…)
                <input
                  name={`s${i}_cta_url`}
                  maxLength={500}
                  defaultValue={s.cta_url ?? ""}
                  placeholder="https://chardikalafitness.com/consult"
                  className={field}
                />
              </label>
            </div>
          </Panel>
        ))}
        <div className="flex flex-wrap gap-2">
          <ABtn variant="primary">Save automation</ABtn>
        </div>
      </form>

      {a ? (
        <Panel title="More">
          <div className="flex flex-wrap gap-2">
            {(a.steps ?? []).map((s, i) => (
              <form key={i} action={testStep.bind(null, a.id, i)}>
                <ABtn>Send email {i + 1} to me</ABtn>
              </form>
            ))}
            {a.trigger_type === "tag_added" || a.trigger_type === "stage" ? (
              <form action={enrollExisting.bind(null, a.id)}>
                <ABtn>Also start it for people who already match</ABtn>
              </form>
            ) : null}
            <form action={deleteAutomation.bind(null, a.id)}>
              <ABtn variant="danger">Delete</ABtn>
            </form>
          </div>
          <p className="mt-2 text-xs text-muted">
            Normally it only starts for people who get the tag or stage from now on. The
            middle button adds everyone who already has it (only those we may email will
            get anything).
          </p>
        </Panel>
      ) : null}
    </>
  );
}
