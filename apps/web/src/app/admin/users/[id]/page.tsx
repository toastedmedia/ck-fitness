/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  resolveMembership,
  STAFF_ROLES,
  displayLength,
  displayWeight,
  type Units,
} from "@ck/core";
import { LineChart } from "@/components/app/charts";
import { ABtn, Flash, H1, Panel, Status, Table, aInput, td } from "@/components/admin/ui";
import { audit, SUPPORT, requireStaff } from "@/lib/admin";
import { listInvoices } from "@/lib/stripe";
import { ActivityTab, GiveAccess, MemberTags, ProgramsTab } from "./sections";
import {
  addClientNote,
  deleteClientNote,
  setMembership,
  setStaffRole,
  updateClientContact,
} from "../../actions";

export const metadata: Metadata = { title: "Client" };

const TABS = [
  ["overview", "Overview"],
  ["questionnaire", "Questionnaire"],
  ["checkins", "Check-ins"],
  ["progress", "Progress"],
  ["programs", "Trainings"],
  ["activity", "Activity"],
  ["photos", "Photos"],
  ["notes", "Notes"],
] as const;
const SENSITIVE = new Set([
  "questionnaire",
  "checkins",
  "progress",
  "photos",
  "activity",
]);
const label = (v: unknown) =>
  v == null || v === "" ? "-" : String(v).replace(/_/g, " ");
const lab = "text-xs font-bold text-brand";

export default async function AdminClient({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; kind?: string; saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some(([t]) => t === sp.tab) ? sp.tab! : "overview";
  const { supabase, db, roles, user: me } = await requireStaff(SUPPORT);
  const { data: p } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", id)
    .maybeSingle();
  if (!p) notFound();

  const referredCount = p.referral_code
    ? ((
        await db
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("referred_by", id)
      ).count ?? 0)
    : 0;
  let referrer = "";
  if (p.referred_by) {
    const { data: r } = await db
      .from("profiles")
      .select("first_name,last_name,email")
      .eq("user_id", p.referred_by)
      .maybeSingle();
    referrer = r
      ? [r.first_name, r.last_name].filter(Boolean).join(" ") || (r.email ?? "")
      : "";
  }

  const canSeeRecords = roles.some(
    (r) => r === "owner" || r === "admin" || r === "coach",
  );
  const shared = Boolean(p.coach_access_at);
  const photosShared = Boolean(p.photo_coach_access_at);
  const units = (p.units === "imperial" ? "imperial" : "metric") as Units;
  const open = SENSITIVE.has(tab) && canSeeRecords && shared;
  if (open) await audit(supabase, me.id, "client_record.view", id, { tab });

  const isOps = roles.includes("owner") || roles.includes("admin");
  const isOwner = roles.includes("owner");
  const err: Record<string, string> = {
    stripe: "This member pays through Stripe. Manage it in Stripe.",
    role: "Only an owner can change staff roles.",
    lastowner: "There must always be at least one owner.",
    email: "That email could not be changed.",
    name: "Please enter a first and last name.",
    phone: "Enter a valid phone number, or leave it blank.",
  };

  const head = (
    <>
      <H1
        right={
          <Link href="/admin/users" className="text-sm font-bold text-brand underline">
            All users
          </Link>
        }
      >
        {p.first_name} {p.last_name}
      </H1>
      {sp.saved ? <Flash>Saved.</Flash> : null}
      {sp.error ? <Flash bad>{err[sp.error] ?? "Something went wrong."}</Flash> : null}
      <nav aria-label="Client sections" className="flex flex-wrap gap-2">
        {TABS.map(([t, l]) => (
          <Link
            key={t}
            href={`/admin/users/${id}?tab=${t}`}
            aria-current={tab === t ? "page" : undefined}
            className={`inline-flex min-h-10 items-center rounded-full border-2 px-4 text-sm font-semibold ${tab === t ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink"}`}
          >
            {l}
          </Link>
        ))}
      </nav>
    </>
  );

  /* ----------------------------------------------------- programs and activity */
  const ctx = { supabase, db, roles, user: me };
  if (tab === "programs") {
    if (shared && canSeeRecords)
      await audit(supabase, me.id, "client_record.view", id, { tab });
    return (
      <>
        {head}
        {roles.includes("owner") || roles.includes("admin") ? (
          <GiveAccess userId={id} db={db} firstName={p.first_name ?? "this member"} />
        ) : null}
        <ProgramsTab
          ctx={ctx}
          id={id}
          shared={shared && canSeeRecords}
          firstName={p.first_name ?? "She"}
        />
      </>
    );
  }
  if (tab === "activity" && open) {
    return (
      <>
        {head}
        <ActivityTab
          ctx={ctx}
          id={id}
          units={units}
          photosShared={photosShared}
          kind={sp.kind ?? "all"}
        />
      </>
    );
  }

  /* ------------------------------------------------------------ locked */
  if (SENSITIVE.has(tab) && !open) {
    return (
      <>
        {head}
        <Panel>
          <p className="text-sm">
            {!canSeeRecords
              ? "Your role cannot view client records. Coaches, admins and owners can."
              : `${p.first_name} has not shared her records with her coach, so they are hidden. She can turn sharing on in Profile → Sharing with your coach.`}
          </p>
          <p className="mt-2 text-xs text-muted">
            Contact details, plan and support messages are still available under Overview.
          </p>
        </Panel>
      </>
    );
  }

  /* --------------------------------------------------------- overview */
  if (tab === "overview") {
    const [
      { data: m },
      { data: risk },
      { data: enr },
      { data: staff },
      { data: tickets },
      { data: plan },
    ] = await Promise.all([
      db.from("memberships").select("*").eq("user_id", id).maybeSingle(),
      db.from("risk_states").select("state").eq("user_id", id).maybeSingle(),
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
        .select("weekly_target_workouts,preferred_days")
        .eq("user_id", id)
        .maybeSingle(),
    ]);
    // Counts only (no health values), so staff can see engagement even when records are not shared.
    const since14 = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const [wk, wc, hl, dc, lw] = await Promise.all([
      db
        .from("scheduled_actions")
        .select("status")
        .eq("user_id", id)
        .eq("action_type", "workout")
        .gte("scheduled_for", since14),
      db
        .from("weekly_checkins")
        .select("week_start")
        .eq("user_id", id)
        .order("week_start", { ascending: false })
        .limit(8),
      db
        .from("habit_logs")
        .select("log_date,habit_type")
        .eq("user_id", id)
        .gte("log_date", since14),
      db
        .from("daily_checkins")
        .select("check_date")
        .eq("user_id", id)
        .gte("check_date", since14),
      db
        .from("weigh_ins")
        .select("log_date")
        .eq("user_id", id)
        .order("log_date", { ascending: false })
        .limit(1),
    ]);
    const workoutRows = (wk.data ?? []) as { status: string }[];
    const habitRows = (hl.data ?? []) as { log_date: string; habit_type: string }[];
    const waterDays = new Set(
      habitRows.filter((h) => h.habit_type === "water_ml").map((h) => h.log_date),
    ).size;
    const stepDays = new Set(
      habitRows.filter((h) => h.habit_type === "steps").map((h) => h.log_date),
    ).size;
    const res = resolveMembership(m);
    const theirRoles = ((staff ?? []) as { role: string }[]).map((r) => r.role);
    const invoices =
      isOps && m?.provider_customer_id
        ? await listInvoices({ customerId: m.provider_customer_id, limit: 6 })
        : null;
    return (
      <>
        {head}
        <MemberTags userId={id} db={db} canEdit={isOps} />
        <Panel title="Contact details">
          {isOps ? (
            <form
              action={updateClientContact.bind(null, id)}
              className="grid gap-3 md:grid-cols-2"
            >
              <label className={lab}>
                First name
                <input
                  name="first_name"
                  defaultValue={p.first_name ?? ""}
                  required
                  className={aInput}
                />
              </label>
              <label className={lab}>
                Last name
                <input
                  name="last_name"
                  defaultValue={p.last_name ?? ""}
                  required
                  className={aInput}
                />
              </label>
              <label className={lab}>
                Email
                <input
                  name="email"
                  type="email"
                  defaultValue={p.email ?? ""}
                  required
                  className={aInput}
                />
              </label>
              <label className={lab}>
                Phone
                <input
                  name="phone"
                  type="tel"
                  defaultValue={p.phone ?? ""}
                  className={aInput}
                />
              </label>
              <div className="md:col-span-2 flex items-center gap-3">
                <ABtn variant="primary">Save contact details</ABtn>
                <span className="text-xs text-muted">
                  Every change is recorded in the audit log.
                </span>
              </div>
            </form>
          ) : (
            <dl className="grid gap-2 text-sm md:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Email</dt>
                <dd>{p.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Phone</dt>
                <dd>{p.phone ?? "-"}</dd>
              </div>
            </dl>
          )}
        </Panel>
        <Panel title="Summary">
          <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Joined</dt>
              <dd>
                {new Date(p.created_at).toLocaleDateString("en-CA", {
                  timeZone: "America/Vancouver",
                })}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Last active</dt>
              <dd>
                {p.last_active_at
                  ? new Date(p.last_active_at).toLocaleDateString("en-CA", {
                      timeZone: "America/Vancouver",
                    })
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
                  <Status tone="warn">{risk.state.replace("at_risk_", "Quiet ")}</Status>
                ) : (
                  "Active"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Terms accepted</dt>
              <dd>
                {p.terms_accepted_at
                  ? `${new Date(p.terms_accepted_at).toLocaleDateString("en-CA", { timeZone: "America/Vancouver" })} (${p.terms_version ?? "?"})`
                  : "Not recorded"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Sharing records with coach</dt>
              <dd>
                {shared ? (
                  <Status tone="ok">Yes</Status>
                ) : (
                  <Status tone="mute">No</Status>
                )}{" "}
                Photos:{" "}
                {photosShared ? (
                  <Status tone="ok">Yes</Status>
                ) : (
                  <Status tone="mute">No</Status>
                )}
              </dd>
            </div>
            {p.referral_code ? (
              <div className="md:col-span-2">
                <dt className="text-xs text-muted">Referrals</dt>
                <dd>
                  {referredCount} {referredCount === 1 ? "friend has" : "friends have"}{" "}
                  joined with their link
                  {referrer ? `. Joined through ${referrer}` : ""}.
                </dd>
              </div>
            ) : null}
            <div className="md:col-span-2">
              <dt className="text-xs text-muted">Trainings</dt>
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
        </Panel>
        <Panel title="Activity (last 14 days)">
          <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-3">
            <div>
              <dt className="text-xs text-muted">Workouts completed</dt>
              <dd>
                {workoutRows.filter((w) => w.status === "completed").length} of{" "}
                {
                  workoutRows.filter(
                    (w) => w.status === "completed" || w.status === "planned",
                  ).length
                }{" "}
                planned
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Weekly check-ins done</dt>
              <dd>{(wc.data ?? []).length} (last 8 weeks)</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Daily check-ins</dt>
              <dd>{(dc.data ?? []).length}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Days with water logged</dt>
              <dd>{waterDays}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Days with steps logged</dt>
              <dd>{stepDays}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Last weigh-in</dt>
              <dd>{lw.data?.[0]?.log_date ?? "-"}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted">
            {shared
              ? "She shares her records, so the details are under Questionnaire, Check-ins and Progress."
              : "These are counts only. The answers and numbers stay private until she chooses to share them with her coach."}
          </p>
        </Panel>
        <Panel title="Membership and billing">
          <p className="text-sm">
            Plan:{" "}
            <Status
              tone={
                res.state === "active" ? "ok" : res.state === "grace" ? "warn" : "mute"
              }
            >
              {res.state === "none"
                ? "Free"
                : `${res.entitlement === "ck_premium" ? "Premium" : "Member"} (${res.state})`}
            </Status>
            {m ? ` · via ${m.provider}` : ""}
            {res.endsAt
              ? ` · until ${new Date(res.endsAt).toLocaleDateString("en-CA", { timeZone: "America/Vancouver" })}`
              : ""}
            {res.cancelling ? " · cancelling" : ""}
          </p>
          {m?.provider_customer_id ? (
            <p className="mt-1 text-sm">
              <a
                className="font-bold text-brand underline"
                href={`https://dashboard.stripe.com/customers/${m.provider_customer_id}`}
                target="_blank"
                rel="noreferrer"
              >
                Open in Stripe
              </a>
            </p>
          ) : null}
          {invoices && invoices.length ? (
            <div className="mt-3">
              <Table head={["Invoice", "Date", "Amount", "Status", ""]}>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <td className={td}>{i.number ?? i.id.slice(-8)}</td>
                    <td className={td}>
                      {new Date(i.created).toLocaleDateString("en-CA", {
                        timeZone: "America/Vancouver",
                      })}
                    </td>
                    <td className={td}>
                      ${i.amount.toFixed(2)} {i.currency}
                    </td>
                    <td className={td}>
                      <Status
                        tone={
                          i.status === "paid"
                            ? "ok"
                            : i.status === "open"
                              ? "warn"
                              : "mute"
                        }
                      >
                        {i.status}
                      </Status>
                    </td>
                    <td className={td}>
                      {i.hostedUrl ? (
                        <a
                          className="font-bold text-brand underline"
                          href={i.hostedUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          ) : null}
          {isOps ? (
            <form
              action={setMembership.bind(null, id)}
              className="mt-3 flex flex-wrap items-end gap-2"
            >
              <label className={lab}>
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
              <Status tone="mute">{t.category}</Status> {t.message.slice(0, 160)}{" "}
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

  /* ------------------------------------------------------- questionnaire */
  if (tab === "questionnaire") {
    const { data: o } = await supabase
      .from("onboarding_profiles")
      .select("*")
      .eq("user_id", id)
      .maybeSingle();
    const flags = (o?.safety_flags ?? {}) as {
      limitations?: string;
      pregnancy_context?: string;
    };
    const age = p.birth_date
      ? Math.floor((Date.now() - new Date(p.birth_date).getTime()) / 31_557_600_000)
      : null;
    const rows: [string, unknown][] = [
      ["Age", age],
      ["Gender", p.gender_preference],
      [
        "Height",
        o?.height_cm
          ? `${displayLength(Number(o.height_cm), units)} ${units === "imperial" ? "in" : "cm"}`
          : null,
      ],
      [
        "Starting weight",
        o?.starting_weight_kg
          ? `${displayWeight(Number(o.starting_weight_kg), units)} ${units === "imperial" ? "lb" : "kg"}`
          : null,
      ],
      ["Main goal", o?.primary_goal],
      ["Other goals", ((o?.secondary_goals ?? []) as string[]).join(", ")],
      ["Level", o?.level],
      ["Trains", o?.training_location],
      ["Equipment", ((o?.equipment ?? []) as string[]).join(", ")],
      [
        "Training days",
        ((o?.preferred_days ?? []) as number[])
          .map((d) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d])
          .join(", "),
      ],
      ["Reminder time", o?.reminder_time?.slice(0, 5)],
      [
        "Weekly commitment",
        o?.weekly_commitment ? `${o.weekly_commitment} workouts` : null,
      ],
      ["Food preference", o?.nutrition_preference],
      ["Usual day", o?.activity_range],
      ["Sleep", o?.sleep_range],
      ["Schedule constraints", o?.schedule_constraints],
      ["Injuries or limitations", flags.limitations],
      ["Pregnant or postpartum", flags.pregnancy_context],
      ["Why she is starting", o?.starting_reason],
      [
        "Safety acknowledgement",
        o?.health_ack_at
          ? new Date(o.health_ack_at).toLocaleDateString("en-CA", {
              timeZone: "America/Vancouver",
            })
          : null,
      ],
    ];
    return (
      <>
        {head}
        <Panel title="Onboarding questionnaire">
          <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-semibold capitalize-first">{label(v)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted">
            Shared by the member. Your access to this page was recorded in the audit log.
          </p>
        </Panel>
      </>
    );
  }

  /* ------------------------------------------------------------ check-ins */
  if (tab === "checkins") {
    const [{ data: daily }, { data: weekly }] = await Promise.all([
      supabase
        .from("daily_checkins")
        .select("check_date,energy,soreness,sleep,mood,optional_note")
        .eq("user_id", id)
        .order("check_date", { ascending: false })
        .limit(30),
      supabase
        .from("weekly_checkins")
        .select(
          "week_start,planned_workouts,completed_workouts,energy,sleep,soreness,confidence,obstacle,note",
        )
        .eq("user_id", id)
        .order("week_start", { ascending: false })
        .limit(10),
    ]);
    const tone = (v: string) => (["low", "poor", "high"].includes(v) ? "warn" : "mute");
    return (
      <>
        {head}
        <Panel title="Daily check-ins (last 30)">
          <Table head={["Date", "Energy", "Soreness", "Sleep", "Mood", "Note"]}>
            {(
              (daily ?? []) as {
                check_date: string;
                energy: string;
                soreness: string;
                sleep: string;
                mood: string;
                optional_note: string | null;
              }[]
            ).map((d) => (
              <tr key={d.check_date}>
                <td className={td}>{d.check_date}</td>
                {[d.energy, d.soreness, d.sleep, d.mood].map((v, i) => (
                  <td key={i} className={td}>
                    <Status tone={tone(v) as "warn" | "mute"}>{v}</Status>
                  </td>
                ))}
                <td className={td}>{d.optional_note ?? ""}</td>
              </tr>
            ))}
          </Table>
          {(daily ?? []).length === 0 ? (
            <p className="py-3 text-sm text-muted">No daily check-ins yet.</p>
          ) : null}
        </Panel>
        <Panel title="Weekly check-ins">
          <Table
            head={[
              "Week of",
              "Workouts",
              "Energy",
              "Sleep",
              "Soreness",
              "Confidence",
              "Got in the way",
              "Note",
            ]}
          >
            {((weekly ?? []) as Record<string, string | number | null>[]).map((w) => (
              <tr key={String(w.week_start)}>
                <td className={td}>{String(w.week_start)}</td>
                <td className={td}>
                  {w.completed_workouts}/{w.planned_workouts}
                </td>
                <td className={td}>{w.energy}/5</td>
                <td className={td}>{w.sleep}/5</td>
                <td className={td}>{w.soreness}/5</td>
                <td className={td}>{w.confidence}/5</td>
                <td className={td}>{label(w.obstacle)}</td>
                <td className={td}>{w.note ?? ""}</td>
              </tr>
            ))}
          </Table>
          {(weekly ?? []).length === 0 ? (
            <p className="py-3 text-sm text-muted">No weekly check-ins yet.</p>
          ) : null}
        </Panel>
      </>
    );
  }

  /* ------------------------------------------------------------- progress */
  if (tab === "progress") {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
    const [{ data: w }, { data: m }, { data: habits }, { data: acts }] =
      await Promise.all([
        supabase
          .from("weigh_ins")
          .select("log_date,weight_kg")
          .eq("user_id", id)
          .order("log_date")
          .limit(90),
        supabase
          .from("body_measurements")
          .select("*")
          .eq("user_id", id)
          .order("log_date", { ascending: false })
          .limit(6),
        supabase
          .from("habit_logs")
          .select("log_date,habit_type,value")
          .eq("user_id", id)
          .gte("log_date", since),
        supabase
          .from("scheduled_actions")
          .select("status")
          .eq("user_id", id)
          .eq("action_type", "workout")
          .gte("scheduled_for", since),
      ]);
    const weights = (w ?? []) as { log_date: string; weight_kg: number }[];
    const byDay = new Map<string, { water: number; steps: number }>();
    for (const h of (habits ?? []) as {
      log_date: string;
      habit_type: string;
      value: number;
    }[]) {
      const d = byDay.get(h.log_date) ?? { water: 0, steps: 0 };
      if (h.habit_type === "water_ml") d.water += Number(h.value);
      else d.steps = Number(h.value);
      byDay.set(h.log_date, d);
    }
    const planned = ((acts ?? []) as { status: string }[]).filter(
      (a) => a.status === "planned" || a.status === "completed",
    );
    const done = planned.filter((a) => a.status === "completed").length;
    const unit = units === "imperial" ? "lb" : "kg";
    const len = units === "imperial" ? "in" : "cm";
    return (
      <>
        {head}
        <Panel title="Weight">
          <LineChart
            label="Weight over time"
            unit={` ${unit}`}
            points={weights.slice(-16).map((x) => ({
              x: x.log_date.slice(5),
              y: displayWeight(Number(x.weight_kg), units),
            }))}
          />
          <p className="mt-1 text-xs text-muted">
            {weights.length
              ? `Latest ${displayWeight(Number(weights[weights.length - 1].weight_kg), units)} ${unit} on ${weights[weights.length - 1].log_date}. ${weights.length} weigh-ins in total.`
              : "No weigh-ins yet."}
          </p>
        </Panel>
        <Panel title="Measurements">
          <Table
            head={[
              "Date",
              `Waist (${len})`,
              `Hips (${len})`,
              `Bust (${len})`,
              `Thigh (${len})`,
              `Arm (${len})`,
            ]}
          >
            {((m ?? []) as Record<string, string | number | null>[]).map((r) => (
              <tr key={String(r.log_date)}>
                <td className={td}>{String(r.log_date)}</td>
                {["waist_cm", "hips_cm", "bust_cm", "thigh_cm", "arm_cm"].map((k) => (
                  <td key={k} className={td}>
                    {r[k] != null ? displayLength(Number(r[k]), units) : "-"}
                  </td>
                ))}
              </tr>
            ))}
          </Table>
          {(m ?? []).length === 0 ? (
            <p className="py-3 text-sm text-muted">No measurements yet.</p>
          ) : null}
        </Panel>
        <Panel title="Last 14 days">
          <p className="text-sm">
            Workouts:{" "}
            <b>
              {done} of {planned.length}
            </b>{" "}
            completed ({planned.length ? Math.round((done / planned.length) * 100) : 0}%)
          </p>
          <Table head={["Day", "Water (mL)", "Steps"]}>
            {[...byDay.entries()]
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([d, v]) => (
                <tr key={d}>
                  <td className={td}>{d}</td>
                  <td className={td}>{v.water}</td>
                  <td className={td}>{v.steps || "-"}</td>
                </tr>
              ))}
          </Table>
        </Panel>
      </>
    );
  }

  /* --------------------------------------------------------------- photos */
  if (tab === "photos") {
    if (!photosShared) {
      return (
        <>
          {head}
          <Panel>
            <p className="text-sm">
              {p.first_name} has shared her records but has <b>not</b> chosen to share
              progress photos, so they are hidden.
            </p>
          </Panel>
        </>
      );
    }
    const { data: photos } = await supabase
      .from("progress_photos")
      .select("id,pose,week_start,storage_path")
      .eq("user_id", id)
      .order("week_start", { ascending: false })
      .limit(48);
    const list = (photos ?? []) as {
      id: string;
      pose: string;
      week_start: string;
      storage_path: string;
    }[];
    const { data: signed } = list.length
      ? await supabase.storage.from("progress-photos").createSignedUrls(
          list.map((x) => x.storage_path),
          120,
        )
      : { data: [] };
    const url = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    const weeks = [...new Set(list.map((x) => x.week_start))];
    return (
      <>
        {head}
        {weeks.length === 0 ? (
          <Panel>
            <p className="text-sm text-muted">No photos uploaded yet.</p>
          </Panel>
        ) : (
          weeks.map((wk) => (
            <Panel key={wk} title={`Week of ${wk}`}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {["front", "side", "back", "arms_raised"].map((pose) => {
                  const ph = list.find((x) => x.week_start === wk && x.pose === pose);
                  return ph ? (
                    <figure key={pose}>
                      <img
                        src={url.get(ph.storage_path) ?? undefined}
                        alt={`${pose} photo, week of ${wk}`}
                        className="aspect-[3/4] w-full rounded-xl object-cover"
                      />
                      <figcaption className="mt-1 text-xs text-muted">
                        {label(pose)}
                      </figcaption>
                    </figure>
                  ) : (
                    <div
                      key={pose}
                      className="grid aspect-[3/4] place-items-center rounded-xl bg-page text-xs text-muted"
                    >
                      {label(pose)}: none
                    </div>
                  );
                })}
              </div>
            </Panel>
          ))
        )}
      </>
    );
  }

  /* ---------------------------------------------------------------- notes */
  const { data: notes } = await supabase
    .from("client_notes")
    .select("id,author_id,body,created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  const list = (notes ?? []) as {
    id: string;
    author_id: string | null;
    body: string;
    created_at: string;
  }[];
  const { data: authors } = list.length
    ? await db
        .from("profiles")
        .select("user_id,first_name,last_name")
        .in("user_id", [
          ...new Set(list.map((n) => n.author_id).filter(Boolean)),
        ] as string[])
    : { data: [] };
  const who = new Map(
    ((authors ?? []) as { user_id: string; first_name: string; last_name: string }[]).map(
      (a) => [a.user_id, `${a.first_name} ${a.last_name}`],
    ),
  );
  return (
    <>
      {head}
      <Panel title="Add a private note">
        <form action={addClientNote.bind(null, id)} className="flex flex-col gap-2">
          <textarea
            name="body"
            rows={3}
            maxLength={2000}
            required
            placeholder="For example: prefers morning sessions, knee needs low-impact alternatives"
            className={`${aInput} py-2`}
          />
          <ABtn variant="primary" className="self-start">
            Add note
          </ABtn>
        </form>
        <p className="mt-2 text-xs text-muted">
          Notes are private to staff. The member never sees them.
        </p>
      </Panel>
      {list.map((n) => (
        <Panel key={n.id}>
          <p className="whitespace-pre-line text-sm">{n.body}</p>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>
              {(n.author_id && who.get(n.author_id)) || "Staff"} ·{" "}
              {new Date(n.created_at).toLocaleString("en-CA", {
                timeZone: "America/Vancouver",
              })}
            </span>
            {n.author_id === me.id || roles.includes("owner") ? (
              <form action={deleteClientNote.bind(null, id, n.id)}>
                <button className="font-bold text-danger underline">Delete</button>
              </form>
            ) : null}
          </div>
        </Panel>
      ))}
      {list.length === 0 ? (
        <Panel>
          <p className="text-sm text-muted">No notes yet.</p>
        </Panel>
      ) : null}
    </>
  );
}
