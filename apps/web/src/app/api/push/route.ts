import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/same-origin";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function who(request: NextRequest) {
  if (!isSameOrigin(request))
    return { error: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { error: NextResponse.json({ error: "Please log in." }, { status: 401 }) };
  return { supabase, user };
}

/** Saves this device so we can send it notifications. Row-level security keeps it her own. */
export async function POST(request: NextRequest) {
  const w = await who(request);
  if (w.error) return w.error;
  const b = (await request.json().catch(() => ({}))) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (
    !b.endpoint?.startsWith("https://") ||
    b.endpoint.length > 1000 ||
    !b.keys?.p256dh ||
    !b.keys?.auth
  )
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  // Re-subscribing the same device (possibly after another member used it) replaces the row.
  await w.supabase.from("push_subscriptions").delete().eq("endpoint", b.endpoint);
  const { error } = await w.supabase.from("push_subscriptions").insert({
    user_id: w.user.id,
    endpoint: b.endpoint,
    p256dh: b.keys.p256dh,
    auth: b.keys.auth,
  });
  if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });
  // Turning on a device means she wants push.
  await w.supabase
    .from("notification_preferences")
    .upsert({ user_id: w.user.id, push: true }, { onConflict: "user_id" });
  return NextResponse.json({ ok: true });
}

/** Forgets this device. */
export async function DELETE(request: NextRequest) {
  const w = await who(request);
  if (w.error) return w.error;
  const b = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (!b.endpoint) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  await w.supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", b.endpoint)
    .eq("user_id", w.user.id);
  return NextResponse.json({ ok: true });
}
