import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/same-origin";
import { track } from "@/lib/events";
import { stripeClient } from "@/lib/stripe";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Starts Stripe Checkout for the CK Membership. Price and plan come from Stripe, not from the app. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Bad request." }, { status: 403 });
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.redirect(new URL("/login", request.url), { status: 303 });

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId)
    return NextResponse.redirect(new URL("/membership?status=unavailable", request.url), {
      status: 303,
    });

  await track(user.id, "checkout_started");
  const { data: existing } = await supabase
    .from("memberships")
    .select("provider_customer_id,status")
    .eq("user_id", user.id)
    .maybeSingle();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const session = await stripeClient().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: user.id,
    ...(existing?.provider_customer_id
      ? { customer: existing.provider_customer_id }
      : { customer_email: user.email }),
    subscription_data: { metadata: { user_id: user.id } },
    success_url: `${origin}/membership?status=success`,
    cancel_url: `${origin}/membership?status=cancelled`,
    allow_promotion_codes: true,
  });
  return NextResponse.redirect(session.url!, { status: 303 });
}
