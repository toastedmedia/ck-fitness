import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveMembership, STAFF_ROLES } from "@ck/core";
import { ABtn, Flash, H1, Panel, Status, aInput } from "@/components/admin/ui";
import { SUPPORT, requireStaff } from "@/lib/admin";
import { setMembership, setStaffRole } from "../../actions";

export const metadata: Metadata = { title: "User" };

export default async function AdminUser({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { db, roles } = await requireStaff(SUPPORT);
  const { data: p } = await db
    .from("profiles")
    .select(
      "user_id,first_name,last_name,email,onboarding_complete,last_active_at,created_at",
    )
    .eq("user_id", id)
    .maybeSingle();
  if (!p) notFound();
  const [
    { data: m },
    { data: risk },
    { data: enr },
    { data: staff },
    { data: tickets },
    { data: plan },
  ] = await Promise.all([
    db.from("memberships").select("*").eq("user_id", id).maybeSingle(),
    db.from("risk_states").select("state,detected_at").eq("user_id", id).maybeSingle(),
    db.from("program_enrollments").select("status,programs(title)").eq("user_id", id),
    db.from("staff_roles").select("role").eq("user_id", id).eq("active", true),
    db
      .from("support_requests")
      .select("id,category,message,status,created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(5),
    db
      .from("accountability_plans")
      .select("weekly_target_workouts")
      .eq("user_id", id)
      .maybeSingle(),
  ]);
  const res = resolveMembership(m);
  const isOps = roles.includes("owner") || roles.includes("admin");
  const isOwner = roles.includes("owner");
  const theirRoles = ((staff ?? []) as { role: string }[]).map((r) => r.role);
  const err: Record<string, string> = {
    stripe: "This member pays through Stripe. Manage it in Stripe.",
    role: "Only an owner can change staff roles.",
    lastowner: "There must always be at least one owner.",
  };

  return (
    <>
      <H1>
        {p.first_name} {p.last_name}
      </H1>
      {sp.saved ? <Flash>Saved.</Flash> : null}
      {sp.error ? <Flash bad>{err[sp.error] ?? "Something went wrong."}</Flash> : null}
      <Panel title="Summary">
        <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Email</dt>
            <dd>{p.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Joined</dt>
            <dd>{new Date(p.created_at).toLocaleDateString("en-CA")}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Last active</dt>
            <dd>
              {p.last_active_at
                ? new Date(p.last_active_at).toLocaleDateString("en-CA")
                : "Never"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Onboarding</dt>
            <dd>{p.onboarding_complete ? "Complete" : "Not finished"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Weekly target</dt>
            <dd>{plan?.weekly_target_workouts ?? "-"} workouts</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Inactivity</dt>
            <dd>
              {risk && risk.state !== "active" ? (
                <Status tone="warn">{risk.state.replace("at_risk_", "At risk ")}</Status>
              ) : (
                "Active"
              )}
            </dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-xs text-muted">Programs</dt>
            <dd>
              {(
                (enr ?? []) as unknown as {
                  status: string;
                  programs: { title: string } | null;
                }[]
              )
                .map((e) => `${e.programs?.title} (${e.status})`)
                .join(", ") || "None started"}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted">
          Body measurements, weight and safety answers are private to the member and are
          not shown here.
        </p>
      </Panel>

      <Panel title="Membership">
        <p className="text-sm">
          Plan:{" "}
          <Status
            tone={res.state === "active" ? "ok" : res.state === "grace" ? "warn" : "mute"}
          >
            {res.state === "none"
              ? "Free"
              : `${res.entitlement === "ck_premium" ? "Premium" : "Member"} (${res.state})`}
          </Status>
          {m ? ` · via ${m.provider}` : ""}
          {res.endsAt
            ? ` · until ${new Date(res.endsAt).toLocaleDateString("en-CA")}`
            : ""}
        </p>
        {isOps ? (
          <form
            action={setMembership.bind(null, id)}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <label className="text-xs font-bold text-brand">
              Assign manually (coaching clients)
              <select
                name="entitlement"
                defaultValue={m?.provider === "manual" ? m.entitlement : "none"}
                className={aInput}
              >
                <option value="none">No manual access</option>
                <option value="ck_member">Member</option>
                <option value="ck_premium">Premium (coaching)</option>
              </select>
            </label>
            <ABtn variant="primary">Apply</ABtn>
          </form>
        ) : null}
      </Panel>

      {isOwner ? (
        <Panel title="Staff roles (owners only)">
          <div className="flex flex-wrap gap-2">
            {STAFF_ROLES.map((r) => {
              const has = theirRoles.includes(r);
              return (
                <form key={r} action={setStaffRole.bind(null, id, r, !has)}>
                  <ABtn variant={has ? "primary" : "ghost"}>
                    {has ? `Remove ${r}` : `Make ${r}`}
                  </ABtn>
                </form>
              );
            })}
          </div>
        </Panel>
      ) : null}

      <Panel title="Recent support messages">
        {(
          (tickets ?? []) as {
            id: string;
            category: string;
            message: string;
            status: string;
          }[]
        ).map((t) => (
          <p key={t.id} className="border-b border-line py-2 text-sm">
            <Status tone="mute">{t.category}</Status> {t.message.slice(0, 140)}{" "}
            <span className="text-muted">({t.status})</span>
          </p>
        ))}
        {(tickets ?? []).length === 0 ? (
          <p className="text-sm text-muted">None.</p>
        ) : null}
      </Panel>
    </>
  );
}
