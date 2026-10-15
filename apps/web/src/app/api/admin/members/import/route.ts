import { NextResponse, type NextRequest } from "next/server";
import { normalizePhone } from "@ck/core";
import { audit } from "@/lib/admin";
import { addTag, ensureTag } from "@/lib/member-tags";
import { createMember, grantAccess } from "@/lib/members";
import { isSameOrigin } from "@/lib/same-origin";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One batch (up to 40 people) of a member import. The browser sends the file in batches. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const { data: roles } = await supabase
    .from("staff_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("active", true);
  if (!(roles ?? []).some((r: { role: string }) => ["owner", "admin"].includes(r.role)))
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });

  const b = (await request.json().catch(() => ({}))) as {
    rows?: { first?: string; last?: string; email?: string; phone?: string | null }[];
    programId?: string;
    notify?: boolean;
    tag?: string;
  };
  const rows = (b.rows ?? []).slice(0, 40);
  if (!rows.length) return NextResponse.json({ error: "No rows." }, { status: 400 });
  const db = createAdminSupabase();
  const tagId = b.tag ? await ensureTag(db, b.tag, user.id) : null;
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin).replace(
    /\/$/,
    "",
  );

  type Result = {
    email: string;
    status: "created" | "existing" | "failed";
    note?: string;
  };
  const results: Result[] = [];
  const one = async (r: (typeof rows)[number]): Promise<Result> => {
    const email = String(r.email ?? "")
      .trim()
      .toLowerCase();
    if (!EMAIL.test(email)) return { email, status: "failed", note: "Invalid email" };
    try {
      const { id, created } = await createMember(db, {
        first: String(r.first ?? "")
          .trim()
          .slice(0, 60),
        last: String(r.last ?? "")
          .trim()
          .slice(0, 60),
        email,
        phone: r.phone ? normalizePhone(String(r.phone)) : null,
      });
      if (tagId) await addTag(db, tagId, [id]);
      let note = "";
      if (b.programId) {
        const g = await grantAccess(db, id, b.programId);
        note =
          g.membership === "granted"
            ? "Access granted"
            : g.membership === "already"
              ? "Already a paying member"
              : "Enrolled";
      }
      if (created && b.notify)
        await db.auth.resetPasswordForEmail(email, {
          redirectTo: `${site}/auth/callback?next=/reset-password`,
        });
      return { email, status: created ? "created" : "existing", note };
    } catch (e) {
      return { email, status: "failed", note: (e as Error).message.slice(0, 120) };
    }
  };
  for (let i = 0; i < rows.length; i += 5)
    results.push(...(await Promise.all(rows.slice(i, i + 5).map(one))));

  await audit(supabase, user.id, "members.import_batch", "batch", {
    created: results.filter((x) => x.status === "created").length,
    existing: results.filter((x) => x.status === "existing").length,
    failed: results.filter((x) => x.status === "failed").length,
    programId: b.programId ?? null,
  });
  return NextResponse.json({ results });
}
