import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/same-origin";
import { track } from "@/lib/events";
import { stripeClient } from "@/lib/stripe";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Permanently deletes the signed-in member. Related rows are removed by database cascade. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.redirect(new URL("/login", request.url), { status: 303 });

  const form = await request.formData();
  if (
    String(form.get("confirm") ?? "")
      .trim()
      .toUpperCase() !== "DELETE"
  ) {
    return NextResponse.redirect(new URL("/profile?error=confirm", request.url), {
      status: 303,
    });
  }
  const admin = createAdminSupabase();
  const { data: m } = await admin
    .from("memberships")
    .select("provider,provider_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (m?.provider === "stripe" && m.provider_subscription_id) {
    try {
      await stripeClient().subscriptions.cancel(m.provider_subscription_id);
    } catch (e) {
      // Do not delete while billing might continue: ask her to cancel in the billing portal instead.
      console.error("could not cancel subscription before deletion", e);
      return NextResponse.redirect(new URL("/profile?error=billing", request.url), {
        status: 303,
      });
    }
  }
  // Photo files are not removed by the database cascade, so delete them explicitly.
  const { data: photos } = await admin
    .from("progress_photos")
    .select("storage_path")
    .eq("user_id", user.id);
  const photoPaths = ((photos ?? []) as { storage_path: string }[]).map(
    (p) => p.storage_path,
  );
  if (photoPaths.length) await admin.storage.from("progress-photos").remove(photoPaths);
  // Community photos live in storage too (the database cascade does not remove files).
  const { data: files } = await admin.storage
    .from("community-media")
    .list(user.id, { limit: 200 });
  if (files?.length)
    await admin.storage
      .from("community-media")
      .remove(files.map((f) => `${user.id}/${f.name}`));
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (!error) await track(null, "account_deleted");
  if (error)
    return NextResponse.redirect(new URL("/profile?error=delete", request.url), {
      status: 303,
    });
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/?deleted=1", request.url), { status: 303 });
}
