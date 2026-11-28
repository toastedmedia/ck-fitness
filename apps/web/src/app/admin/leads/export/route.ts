import { NextResponse } from "next/server";
import { leadEmailable, sourceLabel, stageLabel } from "@ck/core";
import { requireStaff } from "@/lib/admin";
import { CRM_ROLES, type ContactRow } from "@/lib/leads";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /^[=+\-@]/.test(s)
    ? `"'${s.replace(/"/g, '""')}"`
    : `"${s.replace(/"/g, '""')}"`;
};
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-CA", { timeZone: "America/Vancouver" }) : "";

/** Admin -> Leads -> Export: every contact with stage, tags, email permission and the latest note. */
export async function GET(request: Request) {
  const { db } = await requireStaff([...CRM_ROLES]);
  const tag = new URL(request.url).searchParams.get("tag");
  const contacts: ContactRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("crm_contacts")
      .select("*")
      .order("created_at")
      .range(from, from + 999);
    contacts.push(...((data ?? []) as ContactRow[]));
    if (!data || data.length < 1000) break;
  }
  const [{ data: tags }, { data: maps }, { data: notes }] = await Promise.all([
    db.from("member_tags").select("id,name"),
    db.from("crm_contact_tags").select("contact_id,tag_id").limit(100000),
    db
      .from("crm_activities")
      .select("contact_id,body,created_at")
      .in("kind", ["note", "call", "whatsapp", "email", "meeting"])
      .order("created_at", { ascending: false })
      .limit(50000),
  ]);
  const name = new Map(
    ((tags ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
  );
  const tagsOf = new Map<string, string[]>();
  const ids = new Map<string, Set<string>>();
  for (const m of (maps ?? []) as { contact_id: string; tag_id: string }[]) {
    tagsOf.set(m.contact_id, [
      ...(tagsOf.get(m.contact_id) ?? []),
      name.get(m.tag_id) ?? "",
    ]);
    ids.set(m.contact_id, (ids.get(m.contact_id) ?? new Set()).add(m.tag_id));
  }
  const lastNote = new Map<string, string>();
  for (const n of (notes ?? []) as { contact_id: string; body: string }[])
    if (!lastNote.has(n.contact_id)) lastNote.set(n.contact_id, n.body);
  const rows = [
    [
      "First Name",
      "Last Name",
      "Email",
      "Phone",
      "Stage",
      "Source",
      "Tags",
      "Goal",
      "Can email",
      "Email permission",
      "Unsubscribed",
      "Created",
      "Last activity",
      "Latest note",
      "Old system id",
    ],
    ...contacts
      .filter((c) => !tag || ids.get(c.id)?.has(tag))
      .map((c) => [
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        stageLabel(c.stage),
        sourceLabel(c.source),
        (tagsOf.get(c.id) ?? []).join(", "),
        c.goal,
        leadEmailable(c) ? "yes" : "no",
        c.email_consent_at
          ? `agreed ${day(c.email_consent_at)}`
          : c.implied_consent_until
            ? `implied until ${day(c.implied_consent_until)}`
            : "",
        day(c.unsubscribed_at),
        day(c.created_at),
        day(c.last_activity_at),
        lastNote.get(c.id) ?? "",
        c.external_id,
      ]),
  ];
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ck-leads-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
