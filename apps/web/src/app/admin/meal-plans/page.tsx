import type { Metadata } from "next";
import Link from "next/link";
import { DIET_LABELS, dayKey, mealPlanBlocks, type DietKey } from "@ck/core";
import { ABtn, Flash, H1, Panel, Status, aInput } from "@/components/admin/ui";
import { requireStaff } from "@/lib/admin";
import { deleteMealPlan, saveMealPlan, toggleMealPlan } from "../actions";

export const metadata: Metadata = { title: "Meal plans" };

interface Row {
  id: string;
  title: string;
  diet: DietKey;
  body: string;
  starts_on: string;
  ends_on: string | null;
  published: boolean;
  notify_on: string | null;
  notified_at: string | null;
}

export default async function AdminMealPlans({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; edit?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireStaff(["owner", "admin", "coach", "content_manager"]);
  const { data, error } = await supabase
    .from("diet_plans")
    .select("*")
    .order("starts_on", { ascending: false });
  const rows = (data ?? []) as Row[];
  const edit = rows.find((r) => r.id === sp.edit) ?? null;
  const today = dayKey(new Date(), "America/Vancouver");
  const state = (r: Row) =>
    !r.published
      ? (["mute", "Draft"] as const)
      : r.starts_on > today
        ? (["warn", "Scheduled"] as const)
        : r.ends_on && r.ends_on < today
          ? (["mute", "Ended"] as const)
          : (["ok", "Live"] as const);
  const preview = edit ? mealPlanBlocks(edit.body) : [];
  return (
    <>
      <H1>Meal plans</H1>
      <p className="text-sm text-muted">
        Write a weekly or monthly plan for each diet. Members choose vegetarian or
        non-vegetarian and see the latest live plan under My Week, with a card on Home.
      </p>
      {sp.saved ? <Flash>Saved.</Flash> : null}
      {error ? (
        <Flash bad>
          Meal plans are not ready yet. Run the latest database update (0025).
        </Flash>
      ) : null}
      {sp.error ? (
        <Flash bad>
          {sp.error === "dates"
            ? "Choose a diet and a start date."
            : sp.error === "missing"
              ? "Add a title and the plan text."
              : "Could not save. Try again."}
        </Flash>
      ) : null}
      <Panel title={edit ? "Edit meal plan" : "New meal plan"}>
        <form
          action={saveMealPlan}
          className="grid gap-3 md:grid-cols-2"
          key={edit?.id ?? "new"}
        >
          <input type="hidden" name="id" value={edit?.id ?? ""} />
          <label className="text-xs font-bold text-brand md:col-span-2">
            Title (for example: Week of Nov 3 or November plan)
            <input
              name="title"
              required
              maxLength={120}
              defaultValue={edit?.title ?? ""}
              className={`${aInput} mt-1 font-normal`}
            />
          </label>
          <label className="text-xs font-bold text-brand">
            Diet
            <select
              name="diet"
              defaultValue={edit?.diet ?? "vegetarian"}
              className={`${aInput} mt-1 font-normal`}
            >
              <option value="vegetarian">Vegetarian</option>
              <option value="non_vegetarian">Non-vegetarian</option>
            </select>
          </label>
          <label className="text-xs font-bold text-brand">
            Shows from
            <input
              type="date"
              name="starts_on"
              required
              defaultValue={edit?.starts_on ?? today}
              className={`${aInput} mt-1 font-normal`}
            />
          </label>
          <label className="text-xs font-bold text-brand">
            Last day (optional; the next plan replaces it anyway)
            <input
              type="date"
              name="ends_on"
              defaultValue={edit?.ends_on ?? ""}
              className={`${aInput} mt-1 font-normal`}
            />
          </label>
          <label className="text-xs font-bold text-brand">
            Email and notify members on (optional)
            <input
              type="date"
              name="notify_on"
              defaultValue={edit?.notify_on ?? ""}
              className={`${aInput} mt-1 font-normal`}
            />
            <span className="mt-1 block font-normal text-muted">
              {edit?.notified_at
                ? "Already sent."
                : "Sent that morning (about 8 am Vancouver) to members whose Email switch is on, and shown in their notifications. Only once."}
            </span>
          </label>
          <label className="text-xs font-bold text-brand md:col-span-2">
            Plan text. Paste it in: a line starting with # is a heading (a day or a meal),
            lines starting with - are bullet items (food and portion), a blank line starts
            a new paragraph.
            <textarea
              name="body"
              required
              rows={16}
              maxLength={20000}
              defaultValue={
                edit?.body ??
                "# Monday\n- Breakfast: 1 cup oats, 1 banana, 6 almonds\n- Lunch: 2 rotis, 1 cup dal, salad\n- Dinner: 1 cup paneer curry, 1 cup vegetables\n\nDrink 2.5 litres of water a day."
              }
              className={`${aInput} mt-1 py-2 font-normal`}
            />
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              name="published"
              defaultChecked={edit?.published ?? false}
              className="size-4 accent-brand"
            />
            Published (members can see it from its start date)
          </label>
          <div className="flex gap-2 md:col-span-2">
            <ABtn variant="primary">{edit ? "Save changes" : "Add meal plan"}</ABtn>
            {edit ? (
              <Link
                href="/admin/meal-plans"
                className="inline-flex min-h-10 items-center rounded-button border-2 border-line px-4 text-xs font-bold text-brand"
              >
                Cancel
              </Link>
            ) : null}
          </div>
        </form>
        {edit ? (
          <div className="mt-4 rounded-xl border border-line bg-bg p-3 text-sm">
            <p className="mb-2 text-xs font-bold text-brand">
              Saved version, as members see it
            </p>
            {preview.map((b, i) =>
              b.type === "h" ? (
                <h3 key={i} className="mt-3 font-bold text-brand">
                  {b.text}
                </h3>
              ) : b.type === "ul" ? (
                <ul key={i} className="ml-5 list-disc">
                  {b.items.map((t, j) => (
                    <li key={j}>{t}</li>
                  ))}
                </ul>
              ) : (
                <p key={i} className="mt-2">
                  {b.text}
                </p>
              ),
            )}
          </div>
        ) : null}
      </Panel>
      <Panel title="Your meal plans">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No meal plans yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const [tone, label] = state(r);
              return (
                <li key={r.id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <b className="text-brand">{r.title}</b>
                    <Status tone={tone}>{label}</Status>
                    <span className="text-xs text-muted">
                      {DIET_LABELS[r.diet]} · from {r.starts_on}
                      {r.ends_on ? ` to ${r.ends_on}` : ""}
                      {r.notify_on
                        ? ` · email ${r.notified_at ? "sent" : `on ${r.notify_on}`}`
                        : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/meal-plans?edit=${r.id}`}
                      className="inline-flex min-h-10 items-center rounded-button border-2 border-line px-4 text-xs font-bold text-brand"
                    >
                      Edit
                    </Link>
                    <form action={toggleMealPlan.bind(null, r.id, !r.published)}>
                      <ABtn>{r.published ? "Unpublish" : "Publish"}</ABtn>
                    </form>
                    <form action={deleteMealPlan.bind(null, r.id)}>
                      <ABtn variant="danger">Delete</ABtn>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
