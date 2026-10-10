import { NextResponse, type NextRequest } from "next/server";
import { stripeClient } from "@/lib/stripe";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Permanently deletes the signed-in member. Related rows are removed by database cascade. */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.redirect(new URL("/login", request.url), { status: 303 });

  const form = await request.formData();
  if (String(form.get("confirm") ?? "").trim() !== "DELETE") {
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
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error)
    return NextResponse.redirect(new URL("/profile?error=delete", request.url), {
      status: 303,
    });
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/?deleted=1", request.url), { status: 303 });
}
