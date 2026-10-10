import type { Metadata } from "next";
import { Paywall } from "@/components/app/Paywall";
import { Button, Card, Cap, Flash, Pill } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Membership" };

const fmt = (iso: string | null, tz: string) =>
  iso
    ? new Intl.DateTimeFormat("en-CA", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: tz,
      }).format(new Date(iso))
    : "";

export default async function MembershipPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, tz } = await getContext();
  const { membership } = await getViewer();
  const { data: price } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "membership_price_display")
    .maybeSingle();
  const priceText = String(price?.value ?? "$29.99 CAD / month").replace(/^"|"$/g, "");
  const { state, endsAt, cancelling, entitlement } = membership;
  const premium = entitlement === "ck_premium";

  return (
    <>
      <h1 className="font-display text-[19px] text-brand">Membership</h1>
      {sp.status === "success" ? (
        <Flash>
          Thank you. Your membership is being activated. Refresh in a moment if it does
          not show yet.
        </Flash>
      ) : null}
      {sp.status === "cancelled" ? (
        <Flash tone="error">Checkout was cancelled. You have not been charged.</Flash>
      ) : null}
      {sp.status === "unavailable" ? (
        <Flash tone="error">
          Membership sign-up is not available right now. Please contact support.
        </Flash>
      ) : null}

      {state === "active" || state === "grace" ? (
        <Card>
          <div className="flex items-center justify-between">
            <Cap>{premium ? "CK Premium" : "CK Membership"}</Cap>
            <Pill tone={state === "grace" ? "gold" : "success"}>
              {state === "grace" ? "Payment problem" : "Active"}
            </Pill>
          </div>
          <p className="mt-2 text-xs">
            {state === "grace"
              ? "We could not take your last payment. Please update your card to keep your access."
              : cancelling
                ? `Your membership ends on ${fmt(endsAt, tz)}. You keep full access until then.`
                : endsAt
                  ? `Renews on ${fmt(endsAt, tz)}.`
                  : "No renewal date. Managed by CK."}
          </p>
          {!premium || endsAt ? (
            <form action="/api/stripe/portal" method="post" className="mt-3">
              <Button variant="primary" className="w-full">
                {state === "grace" ? "Update payment method" : "Manage billing or cancel"}
              </Button>
            </form>
          ) : null}
        </Card>
      ) : (
        <>
          {state === "expired" ? (
            <Flash tone="error">
              Your membership has ended. Rejoin any time to unlock everything again. Your
              progress is safe.
            </Flash>
          ) : null}
          <Paywall price={priceText} showCta={false} />
          <form action="/api/stripe/checkout" method="post">
            <Button variant="gold" className="min-h-12 w-full">
              Continue to secure checkout
            </Button>
          </form>
          <p className="text-center text-[10.5px] text-muted">
            Payment is handled by Stripe. We never see or store your card details.
          </p>
        </>
      )}
    </>
  );
}
