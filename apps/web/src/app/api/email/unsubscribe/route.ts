import { NextResponse, type NextRequest } from "next/server";
import { verifyLeadUnsubscribe, verifyUnsubscribe } from "@/lib/email/token";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function turnOff(token: string | null, category: string | null) {
  if (category === "lead") {
    const cid = token ? verifyLeadUnsubscribe(token) : null;
    if (!cid) return false;
    const db = createAdminSupabase();
    const now = new Date().toISOString();
    const { error } = await db
      .from("crm_contacts")
      .update({ unsubscribed_at: now, updated_at: now })
      .eq("id", cid)
      .is("unsubscribed_at", null);
    await db
      .from("crm_automation_runs")
      .update({ status: "stopped", stop_reason: "Unsubscribed", updated_at: now })
      .eq("contact_id", cid)
      .eq("status", "active");
    await db.from("crm_activities").insert({
      contact_id: cid,
      kind: "sent",
      body: "Unsubscribed from emails (link in an email).",
    });
    return !error;
  }
  const id = token ? verifyUnsubscribe(token) : null;
  if (!id) return false;
  // "marketing" stops offers and news only; "content" stops new-training news only;
  // anything else stops all optional emails.
  const patch: {
    user_id: string;
    marketing?: boolean;
    new_content?: boolean;
    email?: boolean;
  } =
    category === "marketing"
      ? { user_id: id, marketing: false }
      : category === "content"
        ? { user_id: id, new_content: false }
        : { user_id: id, email: false };
  const { error } = await createAdminSupabase()
    .from("notification_preferences")
    .upsert(patch, { onConflict: "user_id" });
  return !error;
}

const page = (ok: boolean) =>
  new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title>
<body style="margin:0;background:#f3f4f9;font-family:Arial,Helvetica,sans-serif;color:#1b1b36"><div style="max-width:440px;margin:48px auto;padding:0 20px">
<h1 style="font-size:22px">${ok ? "You are unsubscribed" : "That link did not work"}</h1>
<p style="line-height:1.55">${
      ok
        ? "You will not get these emails any more. Emails about a booking or your account still come through."
        : "The link may be old. You can change your email choices any time in Profile inside the app."
    }</p></div></body>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );

/** One-click link in the email footer (GET) and mail apps' unsubscribe button (POST). */
export async function GET(request: NextRequest) {
  return page(
    await turnOff(
      request.nextUrl.searchParams.get("t"),
      request.nextUrl.searchParams.get("c"),
    ),
  );
}
export async function POST(request: NextRequest) {
  return page(
    await turnOff(
      request.nextUrl.searchParams.get("t"),
      request.nextUrl.searchParams.get("c"),
    ),
  );
}
