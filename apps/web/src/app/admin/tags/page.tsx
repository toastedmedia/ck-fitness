import type { Metadata } from "next";
import { ABtn, Flash, H1, Panel, aInput } from "@/components/admin/ui";
import { CONTENT, requireStaff } from "@/lib/admin";
import { addTag, deleteTag } from "../actions";

export const metadata: Metadata = { title: "Tags" };

const GROUPS = [
  ["category", "Category"],
  ["goal", "Goal"],
  ["delivery", "Where (home, gym...)"],
  ["equipment", "Equipment"],
  ["duration", "Duration"],
];

export default async function AdminTags({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireStaff(CONTENT);
  const { data } = await supabase
    .from("content_tags")
    .select("id,tag_group,label")
    .order("tag_group")
    .order("sort_order");
  const tags = (data ?? []) as { id: string; tag_group: string; label: string }[];
  return (
    <>
      <H1>Categories and tags</H1>
      {sp.saved ? <Flash>Saved.</Flash> : null}
      {sp.error ? (
        <Flash bad>That tag could not be added. It may already exist.</Flash>
      ) : null}
      <Panel title="Add a tag">
        <form action={addTag} className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-bold text-brand">
            Type
            <select name="group" className={aInput}>
              {GROUPS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-48 flex-1 text-xs font-bold text-brand">
            Name
            <input name="label" required maxLength={60} className={aInput} />
          </label>
          <ABtn variant="primary">Add</ABtn>
        </form>
      </Panel>
      {GROUPS.map(([g, label]) => (
        <Panel key={g} title={label}>
          <ul className="flex flex-wrap gap-2">
            {tags
              .filter((t) => t.tag_group === g)
              .map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-1 rounded-full border border-line px-3 py-1 text-sm"
                >
                  {t.label}
                  <form action={deleteTag.bind(null, t.id)}>
                    <button aria-label={`Delete ${t.label}`} className="ml-1 text-muted">
                      ×
                    </button>
                  </form>
                </li>
              ))}
          </ul>
        </Panel>
      ))}
    </>
  );
}
