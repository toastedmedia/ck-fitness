import { NextResponse } from "next/server";
import { audit, OPS, requireStaff } from "@/lib/admin";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  // Quote every value and neutralise spreadsheet formulas (a leading = + - @ can run as a formula).
  const s = String(v ?? "");
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** Contact list for owners and admins: name, email, phone, plan, joined. No health data. Logged. */
export async function GET() {
  const { supabase, user, db } = await requireStaff(OPS);
  const [{ data: profiles }, { data: members }] = await Promise.all([
    db
      .from("profiles")
      .select(
        "user_id,first_name,last_name,email,phone,created_at,onboarding_complete,last_active_at",
      )
      .order("created_at", { ascending: false })
      .limit(5000),
    db.from("memberships").select("user_id,entitlement,status"),
  ]);
  const plan = new Map(
    ((members ?? []) as { user_id: string; entitlement: string; status: string }[]).map(
      (m) => [
        m.user_id,
        m.status === "active" || m.status === "trialing" ? m.entitlement : "free",
      ],
    ),
  );
  const lines = [
    [
      "First name",
      "Last name",
      "Email",
      "Phone",
      "Plan",
      "Joined",
      "Onboarding complete",
      "Last active",
    ]
      .map(cell)
      .join(","),
  ];
  for (const p of (profiles ?? []) as Record<string, string | boolean | null>[]) {
    lines.push(
      [
        p.first_name,
        p.last_name,
        p.email,
        p.phone,
        plan.get(String(p.user_id)) ?? "free",
        String(p.created_at).slice(0, 10),
        p.onboarding_complete ? "yes" : "no",
        p.last_active_at ? String(p.last_active_at).slice(0, 10) : "",
      ]
        .map(cell)
        .join(","),
    );
  }
  await audit(supabase, user.id, "users.export", "contacts", { rows: lines.length - 1 });
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="ck-fitness-contacts.csv"',
      "cache-control": "no-store",
    },
  });
}
