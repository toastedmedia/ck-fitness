import { NextResponse, type NextRequest } from "next/server";
import { CRM_SOURCES, cleanEmail, impliedUntil, isStage, normalizePhone } from "@ck/core";
import { audit } from "@/lib/admin";
import { triggerAutomations } from "@/lib/automations";
import { tagContacts } from "@/lib/leads";
import { ensureTag } from "@/lib/member-tags";
import { isSameOrigin } from "@/lib/same-origin";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface InRow {
  first?: string;
  last?: string;
  email?: string | null;
  phone?: string | null;
  tags?: string[];
  source?: string;
  created?: string | null;
  notes?: string;
  dnd?: boolean;
  externalId?: string;
}
interface Existing {
  id: string;
  email: string | null;
  phone: string | null;
  external_id: string | null;
  first_name: string;
  last_name: string;
  email_consent_at: string | null;
  implied_consent_until: string | null;
  unsubscribed_at: string | null;
}

/**
 * One batch (up to 100 people) of a leads import (Admin -> Leads -> Import). Matches existing
 * contacts by email, then phone, then the old system's contact id; fills blanks, never overwrites a
 * stage; adds tags; records email permission as chosen. Safe to run the same file twice.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in again." }, { status: 401 });
  const { data: roles } = await supabase
    .from("staff_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("active", true);
  if (
    !(roles ?? []).some((r: { role: string }) =>
      ["owner", "admin", "coach"].includes(r.role),
    )
  )
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const b = (await request.json().catch(() => ({}))) as {
    rows?: InRow[];
    tags?: string[];
    useFileTags?: boolean;
    source?: string;
    stage?: string;
    consent?: "express" | "implied_customer" | "implied_enquiry" | "none";
    fileName?: string;
    automations?: boolean;
    first?: boolean;
  };
  const rows = (b.rows ?? []).slice(0, 100);
  if (!rows.length) return NextResponse.json({ error: "No rows." }, { status: 400 });
  const db = createAdminSupabase();
  const now = new Date();
  const nowIso = now.toISOString();
  const source = CRM_SOURCES.some((s) => s.key === b.source) ? b.source! : "other";
  const stage = b.stage && isStage(b.stage) ? b.stage : "new";
  const fileName = String(b.fileName ?? "file").slice(0, 80);

  // Tags: the ones chosen for everyone + (optionally) each person's own tags from the file.
  const tagIds = new Map<string, string>();
  const tagId = async (name: string) => {
    const k = name.trim().toLowerCase();
    if (!k) return null;
    if (!tagIds.has(k)) {
      const id = await ensureTag(db, name, user.id);
      if (!id) return null;
      tagIds.set(k, id);
    }
    return tagIds.get(k)!;
  };
  const everyone: string[] = [];
  for (const t of (b.tags ?? []).slice(0, 10)) {
    const id = await tagId(t);
    if (id) everyone.push(id);
  }

  // Clean rows.
  const clean = rows
    .map((r) => ({
      first: String(r.first ?? "").slice(0, 80),
      last: String(r.last ?? "").slice(0, 80),
      email: r.email ? cleanEmail(String(r.email)) : null,
      phone: r.phone ? normalizePhone(String(r.phone)) : null,
      tags: (r.tags ?? []).map(String).slice(0, 30),
      created:
        r.created && !Number.isNaN(new Date(r.created).getTime())
          ? new Date(r.created).toISOString()
          : null,
      notes: String(r.notes ?? "").slice(0, 4000),
      dnd: r.dnd === true,
      externalId: String(r.externalId ?? "").slice(0, 80) || null,
      fileSource: String(r.source ?? "").slice(0, 60),
    }))
    .filter((r) => r.email || r.phone);

  // Existing contacts, in three lookups.
  const sel =
    "id,email,phone,external_id,first_name,last_name,email_consent_at,implied_consent_until,unsubscribed_at";
  const emails = clean.map((r) => r.email).filter(Boolean) as string[];
  const phones = clean.map((r) => r.phone).filter(Boolean) as string[];
  const exts = clean.map((r) => r.externalId).filter(Boolean) as string[];
  const found: Existing[] = [];
  const [e1, e2, e3] = await Promise.all([
    emails.length
      ? db.from("crm_contacts").select(sel).in("email", emails)
      : { data: [] },
    phones.length
      ? db.from("crm_contacts").select(sel).in("phone", phones)
      : { data: [] },
    exts.length
      ? db.from("crm_contacts").select(sel).in("external_id", exts)
      : { data: [] },
  ]);
  for (const x of [
    ...(e1.data ?? []),
    ...(e2.data ?? []),
    ...(e3.data ?? []),
  ] as Existing[])
    if (!found.some((f) => f.id === x.id)) found.push(x);
  // App accounts with these emails (to link the lead to the member).
  const { data: profs } = emails.length
    ? await db.from("profiles").select("user_id,email").in("email", emails)
    : { data: [] };
  const userOf = new Map(
    ((profs ?? []) as { user_id: string; email: string }[]).map((p) => [
      p.email.toLowerCase(),
      p.user_id,
    ]),
  );
  const { data: linked } = userOf.size
    ? await db
        .from("crm_contacts")
        .select("user_id")
        .in("user_id", [...userOf.values()])
    : { data: [] };
  const taken = new Set(((linked ?? []) as { user_id: string }[]).map((l) => l.user_id));

  const consentPatch = (r: (typeof clean)[number], ex?: Existing) => {
    const p: Record<string, unknown> = {};
    if (r.dnd) {
      if (!ex?.unsubscribed_at) p.unsubscribed_at = nowIso;
      return p;
    }
    if (b.consent === "express" && !ex?.email_consent_at) {
      p.email_consent_at = nowIso;
      p.consent_note = `Import ${fileName}: they agreed to get our emails`;
    } else if (b.consent === "implied_customer" || b.consent === "implied_enquiry") {
      const until = impliedUntil(
        r.created ?? now,
        b.consent === "implied_customer" ? "customer" : "enquiry",
      );
      if (!ex?.implied_consent_until || ex.implied_consent_until < until) {
        p.implied_consent_until = until;
        p.consent_note = `Import ${fileName}: ${b.consent === "implied_customer" ? "client or paid" : "asked about our services"} (implied, ends ${until.slice(0, 10)})`;
      }
    }
    return p;
  };

  const results: {
    key: string;
    status: "created" | "updated" | "failed";
    id?: string;
    note?: string;
  }[] = [];
  const toInsert: Record<string, unknown>[] = [];
  const insertRows: typeof clean = [];
  for (const r of clean) {
    const ex = found.find(
      (f) =>
        (r.email && f.email?.toLowerCase() === r.email) ||
        (r.phone && f.phone === r.phone) ||
        (r.externalId && f.external_id === r.externalId),
    );
    const key = r.email ?? r.phone ?? "";
    if (ex) {
      const patch: Record<string, unknown> = {
        updated_at: nowIso,
        ...consentPatch(r, ex),
      };
      if (!ex.first_name && r.first) patch.first_name = r.first;
      if (!ex.last_name && r.last) patch.last_name = r.last;
      if (!ex.email && r.email) patch.email = r.email;
      if (!ex.phone && r.phone) patch.phone = r.phone;
      if (!ex.external_id && r.externalId) patch.external_id = r.externalId;
      const { error } = await db.from("crm_contacts").update(patch).eq("id", ex.id);
      results.push(
        error
          ? { key, status: "failed", note: error.message.slice(0, 80) }
          : { key, status: "updated", id: ex.id },
      );
    } else {
      const uid = r.email ? userOf.get(r.email) : undefined;
      const user_id = uid && !taken.has(uid) ? uid : null;
      if (user_id) taken.add(user_id);
      toInsert.push({
        first_name: r.first,
        last_name: r.last,
        email: r.email,
        phone: r.phone,
        source,
        stage,
        external_id: r.externalId,
        user_id,
        utm: r.fileSource ? { import_source: r.fileSource } : {},
        created_at: r.created ?? nowIso,
        last_activity_at: r.created ?? nowIso,
        created_by: user.id,
        ...consentPatch(r),
      });
      insertRows.push(r);
    }
  }
  if (toInsert.length) {
    const { data, error } = await db
      .from("crm_contacts")
      .insert(toInsert)
      .select("id,email,phone");
    if (error) {
      // One bad row fails the whole insert: retry one by one so the rest still arrive.
      for (let i = 0; i < toInsert.length; i++) {
        const { data: one, error: e } = await db
          .from("crm_contacts")
          .insert(toInsert[i]!)
          .select("id")
          .single();
        const key = insertRows[i]!.email ?? insertRows[i]!.phone ?? "";
        results.push(
          e || !one
            ? { key, status: "failed", note: (e?.message ?? "").slice(0, 80) }
            : { key, status: "created", id: one.id as string },
        );
      }
    } else
      for (const c of (data ?? []) as {
        id: string;
        email: string | null;
        phone: string | null;
      }[])
        results.push({ key: c.email ?? c.phone ?? "", status: "created", id: c.id });
  }

  // Tags, notes.
  const idOfKey = new Map(results.filter((r) => r.id).map((r) => [r.key, r.id!]));
  const all = [...idOfKey.values()];
  const auto = b.automations === true;
  for (const t of everyone) await tagContacts(db, t, all, auto);
  if (b.useFileTags) {
    const byTag = new Map<string, string[]>();
    for (const r of clean) {
      const id = idOfKey.get(r.email ?? r.phone ?? "");
      if (!id) continue;
      for (const name of r.tags) {
        const tid = await tagId(name);
        if (tid) byTag.set(tid, [...(byTag.get(tid) ?? []), id]);
      }
    }
    for (const [tid, ids] of byTag) await tagContacts(db, tid, ids, auto);
  }
  const notes = clean
    .map((r) => ({ id: idOfKey.get(r.email ?? r.phone ?? ""), r }))
    .filter((x) => x.id && x.r.notes)
    .map((x) => ({
      contact_id: x.id,
      kind: "note",
      body: `From ${fileName}: ${x.r.notes}`,
      created_by: user.id,
    }));
  if (notes.length) await db.from("crm_activities").insert(notes);
  if (auto) {
    const created = results
      .filter((r) => r.status === "created" && r.id)
      .map((r) => r.id!);
    await triggerAutomations(db, "new_lead", "", created);
    await triggerAutomations(db, "new_lead", source, created);
  }
  if (b.first)
    await audit(supabase, user.id, "crm.import", fileName, {
      tags: b.tags ?? [],
      consent: b.consent,
    });
  return NextResponse.json({
    results: results.map(({ key, status, note }) => ({ key, status, note })),
  });
}
