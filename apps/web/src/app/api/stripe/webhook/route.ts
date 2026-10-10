import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripeClient, syncSubscription } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

/** Stripe calls this when a payment or subscription changes. The signature proves it is really Stripe. */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature)
    return NextResponse.json({ error: "Not configured." }, { status: 400 });

  const body = await request.text(); // raw body is required to verify the signature
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "Bad signature." }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode === "subscription" && s.subscription) {
        await syncSubscription(
          typeof s.subscription === "string" ? s.subscription : s.subscription.id,
          s.client_reference_id ?? undefined,
        );
      }
    } else if (SUBSCRIPTION_EVENTS.has(event.type)) {
      await syncSubscription((event.data.object as Stripe.Subscription).id);
    } else if (event.type === "invoice.payment_failed" || event.type === "invoice.paid") {
      const inv = event.data.object as Stripe.Invoice;
      const subId = inv.parent?.subscription_details?.subscription;
      if (subId) await syncSubscription(typeof subId === "string" ? subId : subId.id);
    }
  } catch (e) {
    console.error("stripe webhook failed", event.type, e);
    return NextResponse.json({ error: "Processing failed." }, { status: 500 }); // Stripe will retry
  }
  return NextResponse.json({ received: true });
}
