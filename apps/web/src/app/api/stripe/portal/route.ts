import { NextResponse, type NextRequest } from "next/server";
import { stripeClient } from "@/lib/stripe";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Opens Stripe's billing portal so members can update their card, see invoices or cancel. */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const { data } = await supabase
    .from("memberships")
    .select("provider_customer_id,provider")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data?.provider_customer_id || data.provider !== "stripe")
    return NextResponse.redirect(new URL("/membership", request.url), { status: 303 });
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const session = await stripeClient().billingPortal.sessions.create({
    customer: data.provider_customer_id,
    return_url: `${origin}/membership`,
  });
  return NextResponse.redirect(session.url, { status: 303 });
}
