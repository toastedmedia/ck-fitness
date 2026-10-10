# Payments (Stripe Checkout, direct)

**Decision (2026-10-10):** Phase 1 uses Stripe Checkout directly, not RevenueCat. This avoids a 1% fee on top of Stripe's, and
the `memberships` table is provider-agnostic (`provider`, `source`), so Apple purchases can be added in Phase 2 either through
Apple's server notifications or RevenueCat, without changing any access check. This is the "smallest safe alternative" to guide §3/§10.

## How it works

1. Member opens **Membership** and taps _Continue to secure checkout_ -> `POST /api/stripe/checkout` creates a Stripe Checkout session
   (price comes from `STRIPE_PRICE_ID`, never from the app) tagged with her user id.
2. Stripe takes payment on its own page. Card details never touch CK servers.
3. Stripe calls `POST /api/stripe/webhook` (signature verified). On every relevant event we **re-read the subscription from Stripe**
   and upsert `memberships`, so repeated or out-of-order events cannot corrupt state.
4. Access is computed from `memberships` (`resolveMembership()` in TypeScript and `current_entitlement()` in the database):
   - active/trialing: access until period end
   - cancelled: keeps access until the paid period ends
   - past due: 7 day grace window, then access stops
5. Lifecycle events (`membership_started/cancelled/expired`, `billing_problem`) are queued for Toasted Media CRM and shown to the member as in-app notifications.
6. _Manage billing or cancel_ opens Stripe's customer portal (`POST /api/stripe/portal`).

## Stripe setup checklist

- Create a product "CK Membership" with a recurring price of **29.99 CAD / month**; copy the price id to `STRIPE_PRICE_ID`.
- Developers -> Webhooks -> add endpoint `https://<your-domain>/api/stripe/webhook` with events:
  `checkout.session.completed`, `customer.subscription.created|updated|deleted|paused|resumed`, `invoice.paid`, `invoice.payment_failed`.
  Copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
- Settings -> Billing -> Customer portal: enable cancel subscription, update payment method, invoice history.
- Test with Stripe test mode and test card `4242 4242 4242 4242` before going live.
- `STRIPE_SECRET_KEY` is server-only. Never expose it to the browser.

## Manually assigned premium clients

Staff can insert a `memberships` row with `provider = 'manual'`, `entitlement = 'ck_premium'`. Stripe webhooks never overwrite manual rows.
