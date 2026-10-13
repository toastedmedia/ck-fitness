import {
  canAccess,
  displayLength,
  displayWeight,
  resolveMembership,
  type AccessLevel,
  type Units,
} from "@ck/core";
import { ABtn, Panel, Status, Table, aInput, td } from "@/components/admin/ui";
import { giveAccessToUser } from "../../actions";
import type { requireStaff } from "@/lib/admin";

type Ctx = Awaited<ReturnType<typeof requireStaff>>;
const mmss = (sec: number) =>
  `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-CA", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "-";
const ACCESS_TEXT: Record<string, string> = {
  free: "Free",
  member: "Members",
  premium_preview: "Premium preview",
  coach_only: "Coaching only",
  hidden: "Hidden",
};

/* ============================================================== PROGRAMS */
export async function ProgramsTab({
  ctx,
  id,
  shared,
  firstName,
}: {
  ctx: Ctx;
  id: string;
  shared: boolean;
  firstName: string;
}) {
  const { supabase, db } = ctx;
  const { data: m } = await db
    .from("memberships")
    .select("entitlement,status,period_end,cancel_at_period_end")
    .eq("user_id", id)
    .maybeSingle();
  const entitlement = resolveMembership(m).entitlement;
  const viewer = { entitlement, staffRoles: [] as never[] };

  const [{ data: programs }, { data: sections }, { data: lessons }] = await Promise.all([
    supabase
      .from("programs")
      .select("id,title,slug,access_level,published")
      .order("sort_order"),
    supabase
      .from("program_sections")
      .select("id,program_id,title,order_index")
      .order("order_index"),
    supabase
      .from("lesson_outline")
      .select("id,section_id,title,duration_minutes,order_index"),
  ]);
  const progs = (programs ?? []) as {
    id: string;
    title: string;
    slug: string;
    access_level: AccessLevel;
    published: boolean;
  }[];
  const secs = (sections ?? []) as {
    id: string;
    program_id: string;
    title: string;
    order_index: number;
  }[];
  const lessonRows = (lessons ?? []) as {
    id: string;
    section_id: string;
    title: string;
    duration_minutes: number | null;
    order_index: number;
  }[];

  const [{ data: enr }, { data: prog }] = shared
    ? await Promise.all([
        supabase
          .from("program_enrollments")
          .select("program_id,status,started_at,completed_at,current_lesson_id")
          .eq("user_id", id),
        supabase
          .from("lesson_progress")
          .select(
            "lesson_id,started_at,completed_at,playback_seconds,furthest_seconds,watch_seconds,play_count,last_watched_at",
          )
          .eq("user_id", id),
      ])
    : [{ data: [] }, { data: [] }];
  const enrollment = new Map(
    (
      (enr ?? []) as {
        program_id: string;
        status: string;
        started_at: string;
        completed_at: string | null;
        current_lesson_id: string | null;
      }[]
    ).map((e) => [e.program_id, e]),
  );
  const progress = new Map(
    (
      (prog ?? []) as {
        lesson_id: string;
        started_at: string;
        completed_at: string | null;
        playback_seconds: number;
        furthest_seconds: number;
        watch_seconds: number;
        play_count: number;
        last_watched_at: string | null;
      }[]
    ).map((p) => [p.lesson_id, p]),
  );
  const titleOf = new Map(lessonRows.map((l) => [l.id, l.title]));

  return (
    <>
      <Panel title="What she can access">
        <p className="text-sm">
          Plan:{" "}
          <Status tone={entitlement === "free" ? "mute" : "ok"}>
            {entitlement === "ck_premium"
              ? "Premium"
              : entitlement === "ck_member"
                ? "Member"
                : "Free"}
          </Status>{" "}
          {entitlement === "free"
            ? "Free programs open, member programs locked."
            : "All member programs open."}
        </p>
        {!shared ? (
          <p className="mt-2 text-xs text-muted">
            {firstName} has not shared her records, so stage and video progress are
            hidden. Access below is based on her plan.
          </p>
        ) : null}
      </Panel>
      {progs.map((p) => {
        const allowed = canAccess(viewer, p.access_level);
        const mine = secs.filter((s) => s.program_id === p.id);
        const all = mine.flatMap((s) =>
          lessonRows
            .filter((l) => l.section_id === s.id)
            .sort((a, b) => a.order_index - b.order_index)
            .map((l) => ({ ...l, section: s.title })),
        );
        const e = enrollment.get(p.id);
        const done = all.filter((l) => progress.get(l.id)?.completed_at).length;
        const totalWatch = all.reduce(
          (sum, l) => sum + (progress.get(l.id)?.watch_seconds ?? 0),
          0,
        );
        return (
          <Panel key={p.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <b className="text-base">{p.title}</b>{" "}
                <span className="text-xs text-muted">/{p.slug}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Status tone={p.published ? "ok" : "warn"}>
                  {p.published ? "Published" : "Draft"}
                </Status>
                <Status tone="mute">
                  {ACCESS_TEXT[p.access_level] ?? p.access_level}
                </Status>
                <Status tone={allowed ? "ok" : "bad"}>
                  {allowed ? "Has access" : "Locked for her"}
                </Status>
              </div>
            </div>
            {shared ? (
              <>
                <p className="mt-2 text-sm">
                  {e ? (
                    <>
                      Stage:{" "}
                      <b>{e.status === "completed" ? "Completed" : "In progress"}</b>.
                      Started {when(e.started_at)}
                      {e.completed_at ? `, finished ${when(e.completed_at)}` : ""}.{" "}
                      {e.current_lesson_id ? (
                        <>
                          Up next: <b>{titleOf.get(e.current_lesson_id) ?? "-"}</b>.
                        </>
                      ) : null}
                    </>
                  ) : (
                    "Not started."
                  )}{" "}
                  {done} of {all.length} lessons completed (
                  {all.length ? Math.round((done / all.length) * 100) : 0}%). Total time
                  watched: {mmss(totalWatch)}.
                </p>
                {all.length ? (
                  <div className="mt-3">
                    <Table
                      head={[
                        "Week / phase",
                        "Lesson",
                        "Length",
                        "Furthest point",
                        "Time watched",
                        "Plays",
                        "Last watched",
                        "Completed",
                      ]}
                    >
                      {all.map((l) => {
                        const pr = progress.get(l.id);
                        const len = (l.duration_minutes ?? 0) * 60;
                        const pct =
                          len && pr
                            ? Math.min(100, Math.round((pr.furthest_seconds / len) * 100))
                            : null;
                        return (
                          <tr key={l.id}>
                            <td className={td}>{l.section}</td>
                            <td className={td}>{l.title}</td>
                            <td className={td}>
                              {l.duration_minutes ? `${l.duration_minutes} min` : "-"}
                            </td>
                            <td className={td}>
                              {pr ? (
                                <>
                                  <span className="tabular-nums">
                                    {mmss(pr.furthest_seconds)}
                                  </span>
                                  {pct !== null ? ` (${pct}%)` : ""}
                                  <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-line">
                                    <div
                                      className="h-full rounded-full bg-success"
                                      style={{ width: `${pct ?? 0}%` }}
                                    />
                                  </div>
                                </>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className={td}>{pr ? mmss(pr.watch_seconds) : "-"}</td>
                            <td className={td}>{pr?.play_count ?? 0}</td>
                            <td className={td}>{when(pr?.last_watched_at ?? null)}</td>
                            <td className={td}>
                              {pr?.completed_at ? (
                                <Status tone="ok">{when(pr.completed_at)}</Status>
                              ) : pr ? (
                                <Status tone="warn">Started</Status>
                              ) : (
                                <Status tone="mute">Not started</Status>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </Table>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted">No lessons published yet.</p>
                )}
              </>
            ) : null}
          </Panel>
        );
      })}
    </>
  );
}

/* ============================================================== ACTIVITY */
interface Item {
  at: string;
  kind: string;
  text: string;
}

const KINDS = [
  ["all", "Everything"],
  ["workout", "Workouts"],
  ["tracking", "Water, steps, weight"],
  ["checkin", "Check-ins"],
  ["learning", "Programs and video"],
  ["account", "Account changes"],
  ["visit", "App visits"],
  ["support", "Support"],
] as const;
const FIELD: Record<string, string> = {
  first_name: "first name",
  last_name: "last name",
  phone: "phone",
  units: "units",
  timezone: "timezone",
  hide_bmi: "hide BMI",
  onboarding_complete: "onboarding finished",
  coach_access_at: "sharing with coach",
  photo_coach_access_at: "photo sharing",
  sharing_decided_at: "sharing choice",
  photo_consent_at: "photo storage",
  gender_preference: "gender",
  weekly_target_workouts: "weekly workout target",
  preferred_days: "training days",
  reminder_time: "reminder time",
  active: "plan active",
  workout: "workout reminders",
  water: "water reminders",
  weekly_checkin: "weekly check-in reminders",
  new_content: "new content notices",
  marketing: "marketing messages",
  email: "email",
  sms: "text messages",
  push: "push notifications",
  quiet_hours: "quiet hours",
  primary_goal: "main goal",
  secondary_goals: "other goals",
  level: "level",
  training_location: "where she trains",
  equipment: "equipment",
  weekly_commitment: "weekly commitment",
  nutrition_preference: "food preference",
  activity_range: "usual day",
  sleep_range: "sleep",
  schedule_constraints: "schedule notes",
  safety_flags: "injuries and safety answers",
  starting_reason: "why she started",
  height_cm: "height",
  starting_weight_kg: "starting weight",
  reminder_time2: "reminder time",
};
const show = (v: unknown) =>
  v === null || v === undefined
    ? "none"
    : typeof v === "object"
      ? JSON.stringify(v)
      : v === true
        ? "on"
        : v === false
          ? "off"
          : String(v);

export async function ActivityTab({
  ctx,
  id,
  units,
  photosShared,
  kind,
}: {
  ctx: Ctx;
  id: string;
  units: Units;
  photosShared: boolean;
  kind: string;
}) {
  const { supabase, db } = ctx;
  const L = 60;
  const [
    acts,
    habits,
    weighs,
    meas,
    daily,
    weekly,
    lessons,
    enrol,
    miles,
    changes,
    support,
    photos,
    events,
  ] = await Promise.all([
    supabase
      .from("scheduled_actions")
      .select("action_type,status,scheduled_for,completed_at,created_at,barrier")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(L),
    supabase
      .from("habit_logs")
      .select("habit_type,value,log_date,created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(L),
    supabase
      .from("weigh_ins")
      .select("weight_kg,log_date,created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(L),
    supabase
      .from("body_measurements")
      .select("waist_cm,hips_cm,bust_cm,thigh_cm,arm_cm,log_date,created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("daily_checkins")
      .select("check_date,energy,soreness,sleep,mood,optional_note,created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(L),
    supabase
      .from("weekly_checkins")
      .select(
        "week_start,completed_workouts,planned_workouts,energy,sleep,soreness,confidence,obstacle,note,created_at",
      )
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("lesson_progress")
      .select(
        "lesson_id,started_at,completed_at,last_watched_at,furthest_seconds,watch_seconds",
      )
      .eq("user_id", id)
      .order("last_watched_at", { ascending: false, nullsFirst: false })
      .limit(L),
    supabase
      .from("program_enrollments")
      .select("started_at,completed_at,status,programs(title)")
      .eq("user_id", id)
      .limit(20),
    supabase
      .from("milestones")
      .select("milestone_type,achieved_at")
      .eq("user_id", id)
      .limit(20),
    supabase
      .from("client_changes")
      .select("source,details,created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(L),
    db
      .from("support_requests")
      .select("category,message,status,created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    photosShared
      ? supabase
          .from("progress_photos")
          .select("pose,created_at")
          .eq("user_id", id)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    db
      .from("analytics_events")
      .select("event_name,properties,created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(L),
  ]);

  const lessonIds = [
    ...new Set(((lessons.data ?? []) as { lesson_id: string }[]).map((l) => l.lesson_id)),
  ];
  const { data: lessonNames } = lessonIds.length
    ? await supabase.from("lesson_outline").select("id,title").in("id", lessonIds)
    : { data: [] };
  const lname = new Map(
    ((lessonNames ?? []) as { id: string; title: string }[]).map((l) => [l.id, l.title]),
  );
  const wUnit = units === "imperial" ? "lb" : "kg",
    lUnit = units === "imperial" ? "in" : "cm";
  const items: Item[] = [];

  for (const a of (acts.data ?? []) as {
    action_type: string;
    status: string;
    scheduled_for: string;
    completed_at: string | null;
    created_at: string;
    barrier: string | null;
  }[]) {
    if (a.action_type === "workout") {
      const text =
        a.status === "completed"
          ? `Completed workout for ${a.scheduled_for}`
          : a.status === "skipped"
            ? `Skipped workout for ${a.scheduled_for}${a.barrier ? ` (reason: ${a.barrier.replace(/_/g, " ")})` : ""}`
            : a.status === "rescheduled"
              ? `Moved workout from ${a.scheduled_for}`
              : `Workout planned for ${a.scheduled_for}`;
      items.push({ at: a.completed_at ?? a.created_at, kind: "workout", text });
    }
  }
  for (const h of (habits.data ?? []) as {
    habit_type: string;
    value: number;
    log_date: string;
    created_at: string;
  }[]) {
    items.push({
      at: h.created_at,
      kind: "tracking",
      text:
        h.habit_type === "water_ml"
          ? `Logged ${h.value} mL of water (${h.log_date})`
          : `Set steps to ${Number(h.value).toLocaleString("en-CA")} (${h.log_date})`,
    });
  }
  for (const w of (weighs.data ?? []) as {
    weight_kg: number;
    log_date: string;
    created_at: string;
  }[])
    items.push({
      at: w.created_at,
      kind: "tracking",
      text: `Weighed in at ${displayWeight(Number(w.weight_kg), units)} ${wUnit} (${w.log_date})`,
    });
  for (const m of (meas.data ?? []) as Record<string, string | number | null>[]) {
    const parts = [
      ["waist", "waist_cm"],
      ["hips", "hips_cm"],
      ["bust", "bust_cm"],
      ["thigh", "thigh_cm"],
      ["arm", "arm_cm"],
    ]
      .filter(([, k]) => m[k] != null)
      .map(([n, k]) => `${n} ${displayLength(Number(m[k]), units)} ${lUnit}`);
    items.push({
      at: String(m.created_at),
      kind: "tracking",
      text: `Logged measurements: ${parts.join(", ")}`,
    });
  }
  for (const c of (daily.data ?? []) as {
    check_date: string;
    energy: string;
    soreness: string;
    sleep: string;
    mood: string;
    optional_note: string | null;
    created_at: string;
  }[]) {
    items.push({
      at: c.created_at,
      kind: "checkin",
      text: `Daily check-in: energy ${c.energy}, soreness ${c.soreness}, sleep ${c.sleep}, mood ${c.mood}${c.optional_note ? `. Note: "${c.optional_note}"` : ""}`,
    });
  }
  for (const w of (weekly.data ?? []) as Record<string, string | number | null>[]) {
    items.push({
      at: String(w.created_at),
      kind: "checkin",
      text: `Weekly check-in (week of ${w.week_start}): ${w.completed_workouts}/${w.planned_workouts} workouts, energy ${w.energy}/5, sleep ${w.sleep}/5, soreness ${w.soreness}/5, confidence ${w.confidence}/5${w.obstacle ? `, in the way: ${String(w.obstacle).replace(/_/g, " ")}` : ""}${w.note ? `. Note: "${w.note}"` : ""}`,
    });
  }
  for (const l of (lessons.data ?? []) as {
    lesson_id: string;
    started_at: string;
    completed_at: string | null;
    last_watched_at: string | null;
    furthest_seconds: number;
    watch_seconds: number;
  }[]) {
    const name = lname.get(l.lesson_id) ?? "a lesson";
    if (l.completed_at)
      items.push({
        at: l.completed_at,
        kind: "learning",
        text: `Completed lesson "${name}"`,
      });
    if (l.last_watched_at)
      items.push({
        at: l.last_watched_at,
        kind: "learning",
        text: `Watched "${name}": reached ${mmss(l.furthest_seconds)}, ${mmss(l.watch_seconds)} watched in total`,
      });
  }
  for (const e of (enrol.data ?? []) as unknown as {
    started_at: string;
    completed_at: string | null;
    programs: { title: string } | null;
  }[]) {
    items.push({
      at: e.started_at,
      kind: "learning",
      text: `Started program "${e.programs?.title}"`,
    });
    if (e.completed_at)
      items.push({
        at: e.completed_at,
        kind: "learning",
        text: `Finished program "${e.programs?.title}"`,
      });
  }
  for (const m of (miles.data ?? []) as { milestone_type: string; achieved_at: string }[])
    items.push({
      at: m.achieved_at,
      kind: "learning",
      text: `Earned milestone: ${m.milestone_type.replace(/_/g, " ")}`,
    });
  for (const c of (changes.data ?? []) as {
    source: string;
    details: Record<string, { from: unknown; to: unknown }>;
    created_at: string;
  }[]) {
    const text = Object.entries(c.details)
      .map(
        ([k, v]) =>
          `${FIELD[k] ?? k.replace(/_/g, " ")}: ${show(v.from)} to ${show(v.to)}`,
      )
      .join("; ");
    items.push({
      at: c.created_at,
      kind: "account",
      text: `Changed ${c.source === "profiles" ? "profile" : c.source === "onboarding_profiles" ? "questionnaire answers" : c.source === "accountability_plans" ? "training plan" : "notification settings"}: ${text}`,
    });
  }
  for (const s of (support.data ?? []) as {
    category: string;
    message: string;
    status: string;
    created_at: string;
  }[])
    items.push({
      at: s.created_at,
      kind: "support",
      text: `Sent a ${s.category} message: "${s.message.slice(0, 120)}"`,
    });
  for (const p of (photos.data ?? []) as { pose: string; created_at: string }[])
    items.push({
      at: p.created_at,
      kind: "tracking",
      text: `Uploaded a ${p.pose.replace(/_/g, " ")} progress photo`,
    });
  const EVENT: Record<string, string> = {
    dashboard_viewed: "Opened the app",
    program_viewed: "Viewed a program",
    lesson_started: "Opened a lesson",
    paywall_viewed: "Saw the membership offer",
    checkout_started: "Started checkout",
    daily_checkin_completed: "Completed the daily check-in",
    barrier_selected: "Chose what is getting in the way",
    sharing_on: "Turned sharing with coach on",
    sharing_off: "Turned sharing with coach off",
    onboarding_started: "Started onboarding",
    onboarding_completed: "Finished onboarding",
    signup: "Created her account",
  };
  for (const e of (events.data ?? []) as { event_name: string; created_at: string }[]) {
    if (EVENT[e.event_name])
      items.push({
        at: e.created_at,
        kind:
          e.event_name === "dashboard_viewed" ||
          e.event_name === "program_viewed" ||
          e.event_name === "lesson_started" ||
          e.event_name === "paywall_viewed"
            ? "visit"
            : "account",
        text: EVENT[e.event_name],
      });
  }

  const shown = items
    .filter((i) => kind === "all" || i.kind === kind)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 200);
  const byDay = new Map<string, Item[]>();
  for (const i of shown) {
    const d = i.at.slice(0, 10);
    byDay.set(d, [...(byDay.get(d) ?? []), i]);
  }

  return (
    <>
      <nav aria-label="Activity type" className="flex flex-wrap gap-2">
        {KINDS.map(([k, label]) => (
          <a
            key={k}
            href={`/admin/users/${id}?tab=activity&kind=${k}`}
            aria-current={kind === k ? "page" : undefined}
            className={`inline-flex min-h-9 items-center rounded-full border-2 px-3 text-xs font-semibold ${kind === k ? "border-brand bg-brand text-on-brand" : "border-line bg-surface"}`}
          >
            {label}
          </a>
        ))}
      </nav>
      {byDay.size === 0 ? (
        <Panel>
          <p className="text-sm text-muted">Nothing here yet.</p>
        </Panel>
      ) : (
        [...byDay.entries()].map(([day, list]) => (
          <Panel
            key={day}
            title={new Date(`${day}T12:00:00Z`).toLocaleDateString("en-CA", {
              weekday: "long",
              day: "numeric",
              month: "long",
              timeZone: "UTC",
            })}
          >
            <ul className="flex flex-col divide-y divide-line">
              {list.map((i, n) => (
                <li key={n} className="flex items-start gap-3 py-2 text-sm">
                  <span className="w-14 shrink-0 text-xs tabular-nums text-muted">
                    {new Date(i.at).toLocaleTimeString("en-CA", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <Status tone="mute">{i.kind}</Status>
                  <span className="min-w-0 flex-1">{i.text}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ))
      )}
      <p className="text-xs text-muted">
        Shows her latest changes and actions. Your access to this page was recorded in the
        audit log.
      </p>
    </>
  );
}

/** Owner/admin: give this member a program the way a payment would (manual membership + enrol). */
export async function GiveAccess({
  userId,
  db,
  firstName,
}: {
  userId: string;
  db: Ctx["db"];
  firstName: string;
}) {
  const { data } = await db
    .from("programs")
    .select("id,title,access_level")
    .order("sort_order");
  const list = (data ?? []) as { id: string; title: string; access_level: string }[];
  return (
    <Panel title="Give access to a program">
      <p className="text-sm text-muted">
        Use this when {firstName} has paid you directly. For a paid program it gives them
        CK Membership (all member programs, same as a payment) and adds the program to My
        Programs. Take it away later under Overview, Assign manually.
      </p>
      <form
        action={giveAccessToUser.bind(null, userId)}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <label className="min-w-60 flex-1 text-xs font-bold text-brand">
          Program
          <select name="program_id" required className={aInput}>
            <option value="">Choose a program</option>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.access_level === "free" ? "free" : "paid"})
              </option>
            ))}
          </select>
        </label>
        <ABtn variant="primary">Give access</ABtn>
      </form>
    </Panel>
  );
}
