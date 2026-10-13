import type { Metadata } from "next";
import Link from "next/link";
import { resolveMembership } from "@ck/core";
import { MemberImport } from "@/components/admin/MemberImport";
import { ABtn, Flash, H1, Panel, Status, Table, aInput, td } from "@/components/admin/ui";
import { SUPPORT, requireStaff } from "@/lib/admin";
import { addMember } from "../actions";

export const metadata: Metadata = { title: "Users" };

const FILTERS = [
  ["all", "All"],
  ["members", "Members"],
  ["free", "Free"],
  ["quiet", "Quiet 7+ days"],
  ["incomplete", "Not finished onboarding"],
] as const;

/** Everyone in one list: contact details, plan and activity. Health records are opened per client, with consent. */
export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string; view?: string; error?: string }>;
}) {
  const { q = "", f = "all", view, error } = await searchParams;
  const filter = FILTERS.some(([k]) => k === f) ? f : "all";
  const { db, roles } = await requireStaff(SUPPORT);
  const isOps = roles.includes("owner") || roles.includes("admin");
  const term = q.trim().replace(/[%,()]/g, "");
  const { data: progList } =
    isOps && (view === "add" || view === "import")
      ? await db.from("programs").select("id,title").order("sort_order")
      : { data: [] };
  const programs = (progList ?? []) as { id: string; title: string }[];
  const errors: Record<string, string> = {
    name: "Please enter a first and last name.",
    email: "Please enter a valid email address.",
    phone: "Please enter a valid phone number.",
    save: "We could not create that account. Please try again.",
  };

  let query = db
    .from("profiles")
    .select(
      "user_id,first_name,last_name,email,phone,onboarding_complete,last_active_at,created_at,coach_access_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (term)
    query = query.or(
      `email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%`,
    );
  if (filter === "incomplete") query = query.eq("onboarding_complete", false);
  const { data } = await query;
  const all = (data ?? []) as {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    onboarding_complete: boolean;
    last_active_at: string | null;
    created_at: string;
    coach_access_at: string | null;
  }[];
  const ids = all.map((r) => r.user_id);
  const [{ data: ms }, { data: rs }] = await Promise.all([
    ids.length
      ? db
          .from("memberships")
          .select("user_id,entitlement,status,period_end,cancel_at_period_end")
          .in("user_id", ids)
      : { data: [] },
    ids.length
      ? db.from("risk_states").select("user_id,state").in("user_id", ids)
      : { data: [] },
  ]);
  const mem = new Map(
    (
      (ms ?? []) as {
        user_id: string;
        entitlement: string;
        status: string;
        period_end: string | null;
        cancel_at_period_end: boolean;
      }[]
    ).map((m) => [m.user_id, resolveMembership(m)]),
  );
  const risk = new Map(
    ((rs ?? []) as { user_id: string; state: string }[]).map((r) => [r.user_id, r.state]),
  );
  const paid = (id: string) => ["active", "grace"].includes(mem.get(id)?.state ?? "none");
  const rows = all
    .filter((r) =>
      filter === "members"
        ? paid(r.user_id)
        : filter === "free"
          ? !paid(r.user_id)
          : filter === "quiet"
            ? ["at_risk_7d", "at_risk_14d"].includes(risk.get(r.user_id) ?? "")
            : true,
    )
    .slice(0, 100);
  const ago = (iso: string | null) =>
    iso
      ? `${Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000))}d ago`
      : "never";
  const href = (extra: Record<string, string>) =>
    `/admin/users?${new URLSearchParams({ ...(term ? { q: term } : {}), f: filter, ...extra })}`;

  return (
    <>
      <H1
        right={
          isOps ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/admin/users?view=add"
                className="inline-flex min-h-10 items-center rounded-button bg-brand px-4 text-sm font-bold text-on-brand"
              >
                + Add member
              </Link>
              <Link
                href="/admin/users?view=import"
                className="inline-flex min-h-10 items-center rounded-button border-2 border-line px-4 text-sm font-bold text-brand"
              >
                Import CSV
              </Link>
              <a
                href="/admin/users/export"
                download
                className="text-sm font-bold text-brand underline"
              >
                Download contacts (CSV)
              </a>
            </div>
          ) : null
        }
      >
        Users
      </H1>
      {isOps && view === "add" ? (
        <Panel title="Add a member">
          {error ? <Flash bad>{errors[error] ?? "Something went wrong."}</Flash> : null}
          <form action={addMember} className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-bold text-brand">
              First name
              <input name="first_name" required className={aInput} autoComplete="off" />
            </label>
            <label className="text-xs font-bold text-brand">
              Last name
              <input name="last_name" required className={aInput} autoComplete="off" />
            </label>
            <label className="text-xs font-bold text-brand">
              Email
              <input
                name="email"
                type="email"
                required
                className={aInput}
                autoComplete="off"
              />
            </label>
            <label className="text-xs font-bold text-brand">
              Phone number
              <input
                name="phone"
                type="tel"
                required
                className={aInput}
                autoComplete="off"
              />
            </label>
            <label className="text-xs font-bold text-brand md:col-span-2">
              Give access to a program (optional)
              <select name="program_id" className={aInput}>
                <option value="">No program, just create the account</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-start gap-3 text-sm md:col-span-2">
              <input
                name="notify"
                type="checkbox"
                className="mt-0.5 size-5 accent-brand"
              />
              <span>
                <b className="block text-brand">
                  Email a link so they can set a password
                </b>
                <span className="text-xs text-muted">
                  Needs email sending (Resend) connected. Otherwise they sign in with
                  Forgot password.
                </span>
              </span>
            </label>
            <div className="flex gap-2 md:col-span-2">
              <ABtn variant="primary">Add member</ABtn>
              <Link
                href="/admin/users"
                className="inline-flex min-h-10 items-center px-3 text-sm font-bold text-brand underline"
              >
                Cancel
              </Link>
            </div>
          </form>
        </Panel>
      ) : null}
      {isOps && view === "import" ? (
        <Panel title="Import members from a CSV">
          <MemberImport programs={programs} />
        </Panel>
      ) : null}
      <form className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name, email or phone"
          className={`${aInput} flex-1`}
        />
        <input type="hidden" name="f" value={filter} />
        <ABtn variant="primary">Search</ABtn>
      </form>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([k, l]) => (
          <Link
            key={k}
            href={href({ f: k })}
            aria-current={filter === k ? "page" : undefined}
            className={`inline-flex min-h-9 items-center rounded-full border-2 px-3 text-xs font-semibold ${filter === k ? "border-brand bg-brand text-on-brand" : "border-line bg-surface"}`}
          >
            {l}
          </Link>
        ))}
      </div>
      <Panel>
        <Table
          head={["Name", "Email", "Phone", "Plan", "Onboarding", "Last active", "Status"]}
        >
          {rows.map((r) => {
            const m = mem.get(r.user_id);
            const st = risk.get(r.user_id) ?? "active";
            return (
              <tr key={r.user_id}>
                <td className={td}>
                  <Link
                    className="font-bold text-brand underline"
                    href={`/admin/users/${r.user_id}`}
                  >
                    {r.first_name ?? "(no name)"} {r.last_name}
                  </Link>
                </td>
                <td className={td}>{r.email}</td>
                <td className={td}>{r.phone ?? "-"}</td>
                <td className={td}>
                  {m && m.state === "active" ? (
                    <Status tone="ok">
                      {m.entitlement === "ck_premium" ? "Premium" : "Member"}
                    </Status>
                  ) : m && m.state === "grace" ? (
                    <Status tone="warn">Billing problem</Status>
                  ) : (
                    <Status tone="mute">Free</Status>
                  )}
                </td>
                <td className={td}>
                  {r.onboarding_complete ? "Complete" : "Not finished"}
                </td>
                <td className={td}>{ago(r.last_active_at)}</td>
                <td className={td}>
                  {st === "active" ? (
                    "-"
                  ) : (
                    <Status tone={st === "at_risk_14d" ? "bad" : "warn"}>
                      {st.replace("at_risk_", "Quiet ")}
                    </Status>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
        {rows.length === 0 ? (
          <p className="py-3 text-sm text-muted">No members found.</p>
        ) : null}
      </Panel>
      <Panel title="Privacy">
        <p className="text-sm text-muted">
          Open a person to see their questionnaire, check-ins, progress and photos.
          Coaches, admins and owners only see these if the member has chosen to share
          them, and every view is logged.
        </p>
      </Panel>
    </>
  );
}
