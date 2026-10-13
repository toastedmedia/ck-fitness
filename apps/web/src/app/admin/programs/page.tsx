/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { ABtn, Flash, H1, Panel, Status, Table, aInput, td } from "@/components/admin/ui";
import { CONTENT, requireStaff } from "@/lib/admin";
import { createProgram, updateProgramAccess } from "../actions";

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
    .select(
      "id,title,slug,access_level,published,featured,duration_label,sort_order,cover_path",
    )
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
    cover_path: string | null;
  }[];
  return (
    <>
      <H1
        right={
          <Link
            href="/admin/programs/import"
            className="text-sm font-bold text-brand underline"
          >
            Import from spreadsheet
          </Link>
        }
      >
        Programs and content
      </H1>
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
                <div className="flex items-center gap-3">
                  {p.cover_path ? (
                    <img
                      src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/program-thumbnails/${p.cover_path}`}
                      alt=""
                      className="size-10 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="grid size-10 place-items-center rounded-lg bg-page text-[10px] text-muted">
                      No image
                    </span>
                  )}
                  <div>
                    <Link
                      href={`/admin/programs/${p.id}`}
                      className="font-bold text-brand hover:underline focus-visible:underline"
                    >
                      {p.title}
                    </Link>
                    {p.featured ? (
                      <span className="ml-2 text-xs text-muted">featured</span>
                    ) : null}
                    <span className="block text-xs text-muted">/{p.slug}</span>
                  </div>
                </div>
              </td>
              <td className={td}>
                <form
                  action={updateProgramAccess.bind(null, p.id)}
                  className="flex items-center gap-1"
                >
                  <select
                    name="access_level"
                    defaultValue={p.access_level}
                    aria-label={`Access for ${p.title}`}
                    className="min-h-9 rounded-lg border-2 border-line bg-surface px-2 text-xs"
                  >
                    <option value="free">Free</option>
                    <option value="member">Member</option>
                    <option value="premium_preview">Premium preview</option>
                    <option value="coach_only">Coach only</option>
                    <option value="hidden">Hidden</option>
                  </select>
                  <ABtn variant="ghost" className="min-h-9 px-3">
                    Set
                  </ABtn>
                </form>
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
