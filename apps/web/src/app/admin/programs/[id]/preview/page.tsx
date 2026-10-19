import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccess, type AccessLevel } from "@ck/core";
import { Flash, H1, Panel } from "@/components/admin/ui";
import { CONTENT, requireStaff } from "@/lib/admin";
import { Paywall } from "@/components/app/Paywall";

export const metadata: Metadata = { title: "Preview" };

/** Shows how a program looks to a free member or a paying member, without logging in as them. */
export default async function Preview({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const { id } = await params;
  const { as } = await searchParams;
  const { supabase } = await requireStaff([...CONTENT, "coach"]);
  const viewer = {
    entitlement: as === "member" ? ("ck_member" as const) : ("free" as const),
    staffRoles: [],
  };
  const { data: p } = await supabase
    .from("programs")
    .select("title,short_description,long_description,access_level")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();
  const { data: sections } = await supabase
    .from("program_sections")
    .select("id,title,section_type")
    .eq("program_id", id)
    .order("order_index");
  const ids = (sections ?? []).map((s: { id: string }) => s.id);
  const { data: lessons } = ids.length
    ? await supabase
        .from("lessons")
        .select("title,section_id,access_override,duration_minutes,published")
        .in("section_id", ids)
        .order("order_index")
    : { data: [] };
  const allowed = canAccess(viewer, p.access_level as AccessLevel);
  return (
    <>
      <H1
        right={
          <Link
            href={`/admin/programs/${id}`}
            className="text-sm font-bold text-brand underline"
          >
            Back to editor
          </Link>
        }
      >
        Preview as {viewer.entitlement === "free" ? "a Free member" : "a Member"}
      </H1>
      <Flash>
        This is how the training appears to that kind of member. Drafts are shown here,
        but members only see published trainings.
      </Flash>
      <Panel>
        <h2 className="font-display text-xl text-brand">{p.title}</h2>
        <p className="text-sm text-muted">{p.short_description}</p>
        <p className="mt-2 whitespace-pre-line text-sm">{p.long_description}</p>
        <p className="mt-3 text-sm font-bold">
          {allowed
            ? "Button: Start training"
            : "Locked: this member sees the membership offer"}
        </p>
        {!allowed ? (
          <div className="mt-2 max-w-sm">
            <Paywall price="$31.49 CAD / month (includes GST)" showCta={false} />
          </div>
        ) : null}
      </Panel>
      {((sections ?? []) as { id: string; title: string; section_type?: string }[]).map(
        (s) =>
          s.section_type === "phase" ? (
            <h2
              key={s.id}
              className="rounded-xl bg-brand px-3 py-2 text-sm font-bold text-on-brand"
            >
              {s.title}
            </h2>
          ) : (
            <Panel key={s.id} title={s.title}>
              <ul className="flex flex-col divide-y divide-line text-sm">
                {(
                  (lessons ?? []) as {
                    title: string;
                    section_id: string;
                    access_override: AccessLevel | null;
                    duration_minutes: number | null;
                    published: boolean;
                  }[]
                )
                  .filter((l) => l.section_id === s.id)
                  .map((l) => (
                    <li key={l.title} className="flex items-center justify-between py-2">
                      <span>
                        {canAccess(
                          viewer,
                          l.access_override ?? (p.access_level as AccessLevel),
                        )
                          ? ""
                          : "🔒 "}
                        {l.title}
                        {!l.published ? " (hidden)" : ""}
                      </span>
                      <span className="text-muted">
                        {l.duration_minutes ? `${l.duration_minutes} min` : ""}
                      </span>
                    </li>
                  ))}
              </ul>
            </Panel>
          ),
      )}
    </>
  );
}
