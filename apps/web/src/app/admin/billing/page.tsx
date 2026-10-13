import type { Metadata } from "next";
import Link from "next/link";
import { resolveMembership } from "@ck/core";
import { H1, Panel, Status, Table, Tile, td } from "@/components/admin/ui";
import { OPS, requireStaff } from "@/lib/admin";
import { listInvoices } from "@/lib/stripe";

export const metadata: Metadata = { title: "Billing" };

type M = {
  user_id: string;
  provider: string;
  entitlement: string;
  status: string;
  period_end: string | null;
  cancel_at_period_end: boolean;
  provider_customer_id: string | null;
  profiles: { first_name: string; last_name: string; email: string } | null;
};

/** Every paid subscription at a glance, plus recent Stripe invoices. */
export default async function AdminBilling() {
  const { db } = await requireStaff(OPS);
  const [{ data: rows }, { data: price }, onboarded] = await Promise.all([
    db
      .from("memberships")
      .select(
        "user_id,provider,entitlement,status,period_end,cancel_at_period_end,provider_customer_id,profiles(first_name,last_name,email)",
      )
      .order("period_end", { ascending: true }),
    db
      .from("app_settings")
      .select("value")
      .eq("key", "membership_price_amount")
      .maybeSingle(),
    db
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("onboarding_complete", true),
  ]);
  const all = ((rows ?? []) as unknown as M[]).map((m) => ({
    ...m,
    r: resolveMembership(m),
  }));
  const paying = all.filter((m) => m.r.state === "active");
  const stripePaying = paying.filter((m) => m.provider === "stripe");
  const grace = all.filter((m) => m.r.state === "grace");
  const cancelling = paying.filter((m) => m.r.cancelling);
  const amount = typeof price?.value === "number" ? price.value : 29.99;
  const free = Math.max((onboarded.count ?? 0) - paying.length - grace.length, 0);
  const invoices = await listInvoices({ limit: 15 });
  const who = (m: M) =>
    `${m.profiles?.first_name ?? ""} ${m.profiles?.last_name ?? ""}`.trim() ||
    "(no name)";

  return (
    <>
      <H1
        right={
          <a
            className="text-sm font-bold text-brand underline"
            href="https://dashboard.stripe.com/subscriptions"
            target="_blank"
            rel="noreferrer"
          >
            Open Stripe
          </a>
        }
      >
        Billing and subscriptions
      </H1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Tile value={paying.length} label="Paying members" />
        <Tile value={free} label="Free members" />
        <Tile
          value={`$${(stripePaying.length * amount).toFixed(0)}`}
          label="Estimated monthly revenue (Stripe members)"
        />
        <Tile value={grace.length} label="Payment problems" />
        <Tile value={cancelling.length} label="Cancelling at period end" />
        <Tile
          value={
            all.filter((m) => m.provider === "manual" && m.r.state === "active").length
          }
          label="Manual / coaching clients"
        />
      </div>

      <Panel title="All memberships">
        <Table head={["Member", "Plan", "Status", "Renews or ends", "Via", ""]}>
          {all.map((m) => (
            <tr key={m.user_id}>
              <td className={td}>
                <Link
                  href={`/admin/users/${m.user_id}`}
                  className="font-bold text-brand underline"
                >
                  {who(m)}
                </Link>
                <span className="block text-xs text-muted">{m.profiles?.email}</span>
              </td>
              <td className={td}>
                {m.entitlement === "ck_premium" ? "Premium" : "Member"}
              </td>
              <td className={td}>
                <Status
                  tone={
                    m.r.state === "active"
                      ? m.r.cancelling
                        ? "warn"
                        : "ok"
                      : m.r.state === "grace"
                        ? "warn"
                        : "mute"
                  }
                >
                  {m.r.state === "active" && m.r.cancelling
                    ? "Cancelling"
                    : m.r.state === "grace"
                      ? "Payment problem"
                      : m.r.state}
                </Status>
              </td>
              <td className={td}>
                {m.period_end ? new Date(m.period_end).toLocaleDateString("en-CA") : "-"}
              </td>
              <td className={td}>{m.provider}</td>
              <td className={td}>
                {m.provider_customer_id ? (
                  <a
                    className="font-bold text-brand underline"
                    href={`https://dashboard.stripe.com/customers/${m.provider_customer_id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Stripe
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
        {all.length === 0 ? (
          <p className="py-3 text-sm text-muted">No memberships yet.</p>
        ) : null}
      </Panel>

      <Panel title="Recent invoices">
        {invoices === null ? (
          <p className="text-sm text-muted">
            Stripe is not connected yet. Once the Stripe keys are added, the latest
            invoices appear here. Refunds and invoice changes are made in the Stripe
            dashboard.
          </p>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-muted">No invoices yet.</p>
        ) : (
          <Table head={["Date", "Invoice", "Customer", "Amount", "Status", ""]}>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td className={td}>{new Date(i.created).toLocaleDateString("en-CA")}</td>
                <td className={td}>{i.number ?? i.id.slice(-8)}</td>
                <td className={td}>{i.customerEmail ?? "-"}</td>
                <td className={td}>
                  ${i.amount.toFixed(2)} {i.currency}
                </td>
                <td className={td}>
                  <Status
                    tone={
                      i.status === "paid" ? "ok" : i.status === "open" ? "warn" : "mute"
                    }
                  >
                    {i.status}
                  </Status>
                </td>
                <td className={td}>
                  {i.hostedUrl ? (
                    <a
                      className="font-bold text-brand underline"
                      href={i.hostedUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View
                    </a>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
