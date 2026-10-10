import { NextResponse, type NextRequest } from "next/server";
import { daysBetween, dayKey, resolveMembership, riskState } from "@ck/core";
import { cronGuard } from "@/lib/cron";
import { queueCrm } from "@/lib/events";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Daily: classifies each member's inactivity and tells the CRM only when the state changes. */
export async function GET(request: NextRequest) {
  const denied = cronGuard(request);
  if (denied) return denied;
  const db = createAdminSupabase();
  const [{ data: profiles }, { data: members }, { data: states }] = await Promise.all([
    db
      .from("profiles")
      .select("user_id,last_active_at,created_at,timezone")
      .eq("onboarding_complete", true),
    db
      .from("memberships")
      .select("user_id,entitlement,status,period_end,cancel_at_period_end"),
    db.from("risk_states").select("user_id,state"),
  ]);
  const paid = new Set(
    (
      (members ?? []) as {
        user_id: string;
        entitlement: string;
        status: string;
        period_end: string | null;
        cancel_at_period_end: boolean;
      }[]
    )
      .filter((m) => resolveMembership(m).entitlement !== "free")
      .map((m) => m.user_id),
  );
  const prev = new Map(
    ((states ?? []) as { user_id: string; state: string }[]).map((s) => [
      s.user_id,
      s.state,
    ]),
  );
  const now = new Date();
  let changed = 0;

  for (const p of (profiles ?? []) as {
    user_id: string;
    last_active_at: string | null;
    created_at: string;
    timezone: string;
  }[]) {
    const last = p.last_active_at ?? p.created_at;
    const inactive = daysBetween(
      dayKey(new Date(last), p.timezone),
      dayKey(now, p.timezone),
    );
    const state = riskState(inactive, paid.has(p.user_id));
    const before = prev.get(p.user_id) ?? "active";
    if (state === before && prev.has(p.user_id)) continue;
    changed++;
    await db.from("risk_states").upsert(
      {
        user_id: p.user_id,
        state,
        last_activity_at: last,
        detected_at: state === "active" ? null : now.toISOString(),
        resolved_at: state === "active" ? now.toISOString() : null,
      },
      { onConflict: "user_id" },
    );
    if (state === "at_risk_7d" || state === "at_risk_14d")
      await queueCrm(p.user_id, state);
    if (state === "active" && before !== "active")
      await queueCrm(p.user_id, "at_risk_cleared");
  }
  return NextResponse.json({ checked: profiles?.length ?? 0, changed });
}
