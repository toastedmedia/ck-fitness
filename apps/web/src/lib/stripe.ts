import "server-only";
import Stripe from "stripe";
import {
  membershipEvents,
  membershipFromSubscription,
  type MembershipRow,
} from "@ck/core";
import { notifyUser, queueCrm, track } from "@/lib/events";
import { createAdminSupabase } from "@/lib/supabase/admin";

export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing required environment variable: STRIPE_SECRET_KEY");
  return new Stripe(key);
}

/**
 * Brings our memberships table in line with Stripe's current truth for one subscription.
 * Called for every relevant webhook; it re-reads the subscription, so out-of-order or repeated
 * events cannot leave us with stale data.
 */
export async function syncSubscription(subscriptionId: string, fallbackUserId?: string) {
  const stripe = stripeClient();
  const db = createAdminSupabase();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  let userId = sub.metadata?.user_id || fallbackUserId;
  if (!userId) {
    const { data } = await db
      .from("memberships")
      .select("user_id")
      .eq("provider_customer_id", customerId)
      .maybeSingle();
    userId = data?.user_id;
  }
  if (!userId) {
    console.error("stripe webhook: no member found for subscription", subscriptionId);
    return;
  }

  const periodEnd =
    sub.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1000);
  const row = membershipFromSubscription(
    {
      id: sub.id,
      customer: customerId,
      status: sub.status,
      cancel_at_period_end: sub.cancel_at_period_end,
      start_date: sub.start_date,
      period_end: periodEnd,
    },
    userId,
  );

  const { data: previous } = await db
    .from("memberships")
    .select("status,cancel_at_period_end,period_end")
    .eq("user_id", userId)
    .maybeSingle();
  // Manually assigned premium clients are managed by staff, never overwritten by Stripe.
  const { data: manual } = await db
    .from("memberships")
    .select("provider")
    .eq("user_id", userId)
    .maybeSingle();
  if (manual?.provider === "manual") return;

  const { error } = await db.from("memberships").upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(`memberships upsert failed: ${error.message}`);

  for (const event of membershipEvents(
    previous as Pick<MembershipRow, "status" | "cancel_at_period_end"> | null,
    row,
  )) {
    await queueCrm(userId, event, { status: row.status, period_end: row.period_end });
    await track(userId, event);
    if (event === "membership_started")
      await notifyUser(userId, {
        kind: "billing",
        title: "Welcome to CK Membership",
        body: "Your full program library is unlocked.",
        link: "/programs",
      });
    if (event === "billing_problem")
      await notifyUser(userId, {
        kind: "billing",
        title: "There is a problem with your payment",
        body: "Please update your card to keep your access.",
        link: "/membership",
      });
    if (event === "membership_expired")
      await notifyUser(userId, {
        kind: "billing",
        title: "Your membership has ended",
        body: "You can rejoin any time.",
        link: "/membership",
      });
  }
}
