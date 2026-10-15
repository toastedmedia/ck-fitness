import { NextResponse, type NextRequest } from "next/server";
import { cleanIds } from "@ck/core";
import { isSameOrigin } from "@/lib/same-origin";
import { audit, OPS, requireStaff } from "@/lib/admin";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  // Quote every value and neutralise spreadsheet formulas (a leading = + - @ can run as a formula).
  const s = String(v ?? "");
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

/** Contact list for owners and admins: name, email, phone, plan, joined. No health data. Logged. */
export async function GET() {
  return build(null);
}

/** The Users page "Download selected": only the ticked members. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const form = await request.formData();
  const ids = cleanIds(form.getAll("ids"));
  return build(ids.length ? ids : null);
}

async function build(only: string[] | null) {
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
  // Tags are optional (the database change may not be applied yet).
  const tagNames = new Map<string, string>();
  const tagsOf = new Map<string, string[]>();
  const tr = await db.from("member_tags").select("id,name");
  if (!tr.error) {
    for (const t of (tr.data ?? []) as { id: string; name: string }[])
      tagNames.set(t.id, t.name);
    const { data: tm } = await db
      .from("member_tag_map")
      .select("user_id,tag_id")
      .limit(20000);
    for (const row of (tm ?? []) as { user_id: string; tag_id: string }[])
      tagsOf.set(row.user_id, [
        ...(tagsOf.get(row.user_id) ?? []),
        tagNames.get(row.tag_id) ?? "",
      ]);
  }
  const chosen = only ? new Set(only) : null;
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
      "Tags",
    ]
      .map(cell)
      .join(","),
  ];
  for (const p of (profiles ?? []) as Record<string, string | boolean | null>[]) {
    if (chosen && !chosen.has(String(p.user_id))) continue;
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
        (tagsOf.get(String(p.user_id)) ?? []).join("; "),
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
