import type { Metadata } from "next";
import Link from "next/link";
import { ABtn, Flash, H1, Panel, Status, Table, aInput, td } from "@/components/admin/ui";
import { CONTENT, requireStaff } from "@/lib/admin";
import { createProgram } from "../actions";

export const metadata: Metadata = { title: "Programs" };

export default async function AdminPrograms({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireStaff([...CONTENT, "coach"]);
  const { data } = await supabase
    .from("programs")
    .select("id,title,slug,access_level,published,featured,duration_label,sort_order")
    .order("sort_order")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as {
    id: string;
    title: string;
    slug: string;
    access_level: string;
    published: boolean;
    featured: boolean;
    duration_label: string | null;
  }[];
  return (
    <>
      <H1>Programs and content</H1>
      {sp.error ? <Flash bad>Please enter a program title.</Flash> : null}
      <Panel title="New program">
        <form action={createProgram} className="flex flex-wrap items-end gap-2">
          <label className="min-w-60 flex-1 text-xs font-bold text-brand">
            Title
            <input
              name="title"
              required
              maxLength={120}
              className={aInput}
              placeholder="For example, 8-Week Strength Builder"
            />
          </label>
          <ABtn variant="primary">Create draft</ABtn>
        </form>
      </Panel>
      <Panel>
        <Table head={["Program", "Access", "Duration", "Status", ""]}>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className={td}>
                <b>{p.title}</b>
                {p.featured ? (
                  <span className="ml-2 text-xs text-muted">featured</span>
                ) : null}
                <span className="block text-xs text-muted">/{p.slug}</span>
              </td>
              <td className={td}>
                <Status tone={p.access_level === "free" ? "ok" : "mute"}>
                  {p.access_level.replace("_", " ")}
                </Status>
              </td>
              <td className={td}>{p.duration_label ?? "-"}</td>
              <td className={td}>
                <Status tone={p.published ? "ok" : "warn"}>
                  {p.published ? "Published" : "Draft"}
                </Status>
              </td>
              <td className={td}>
                <Link
                  className="font-bold text-brand underline"
                  href={`/admin/programs/${p.id}`}
                >
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </Table>
        {rows.length === 0 ? (
          <p className="py-3 text-sm text-muted">
            No programs yet. Create the first one above.
          </p>
        ) : null}
      </Panel>
    </>
  );
}
