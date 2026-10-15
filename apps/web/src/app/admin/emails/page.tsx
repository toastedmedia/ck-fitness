import type { Metadata } from "next";
import { EMAIL_LABELS, ALWAYS_SENT, renderEmail, type EmailKey } from "@ck/core";
import Link from "next/link";
import { ABtn, Flash, H1, Panel } from "@/components/admin/ui";
import type { CampaignRow } from "@/lib/email/campaign";
import { OPS, requireStaff } from "@/lib/admin";
import { emailConfigured } from "@/lib/email/send";
import { sendTestEmail } from "../actions";

export const metadata: Metadata = { title: "Emails" };

/** Every email the app sends, shown as members see it, with a button to send yourself a test. */
export default async function AdminEmails({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireStaff(OPS);
  const auto = sp.tab === "auto";
  const { data: rows } = auto
    ? { data: [] }
    : await supabase
        .from("email_campaigns")
        .select("id,name,subject,status,total,sent,failed,created_at")
        .order("created_at", { ascending: false });
  const campaigns = (rows ?? []) as Pick<
    CampaignRow,
    "id" | "name" | "subject" | "status" | "total" | "sent" | "failed" | "created_at"
  >[];
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.chardikalafitness.com";
  const keys = Object.keys(EMAIL_LABELS) as EmailKey[];
  return (
    <>
      <H1
        right={
          <Link
            href="/admin/emails/new"
            className="inline-flex min-h-10 items-center rounded-button bg-brand px-4 text-xs font-bold text-on-brand"
          >
            + Create email
          </Link>
        }
      >
        Emails
      </H1>
      <nav className="flex gap-2" aria-label="Email sections">
        {[
          ["Offers and campaigns", "/admin/emails", !auto],
          ["Automatic emails", "/admin/emails?tab=auto", auto],
        ].map(([label, href, on]) => (
          <Link
            key={String(href)}
            href={String(href)}
            className={`min-h-10 rounded-full border-2 px-4 py-2 text-xs font-bold ${on ? "border-brand bg-brand text-on-brand" : "border-line text-brand"}`}
          >
            {String(label)}
          </Link>
        ))}
      </nav>
      {auto ? null : (
        <Panel title="Offers, promos and news">
          <p className="mb-3 text-xs text-muted">
            Write a diet plan, limited-time offer, winter promo or news email and send it
            to members who opted in to Offers and news.
          </p>
          {campaigns.length === 0 ? (
            <p className="text-sm text-muted">Nothing yet. Press + Create email.</p>
          ) : (
            <ul className="divide-y divide-line">
              {campaigns.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <Link href={`/admin/emails/${c.id}`} className="min-w-0 flex-1">
                    <b className="block truncate text-sm text-brand">{c.name}</b>
                    <span className="block truncate text-xs text-muted">{c.subject}</span>
                  </Link>
                  <span className="text-xs">
                    <b className="capitalize">{c.status}</b>
                    {c.status === "draft" ? "" : ` · ${c.sent}/${c.total}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
      {auto && sp.sent ? (
        <Flash>Test email sent to {sp.sent}. Check your inbox (and spam).</Flash>
      ) : null}
      {auto && sp.error ? (
        <Flash bad>
          The test email did not send. Check that RESEND_API_KEY is set in Vercel and
          redeployed.
        </Flash>
      ) : null}
      {emailConfigured() ? null : (
        <Flash bad>
          Sending is not connected yet: add RESEND_API_KEY in Vercel and redeploy. You can
          still preview every email below.
        </Flash>
      )}
      {auto ? (
        <p className="text-sm text-muted">
          These go out automatically. Reminder and nudge emails follow each member&apos;s
          choices in Profile and include a one-click turn-off link. Billing and support
          emails always send. No email ever contains health details.
        </p>
      ) : null}
      {(auto ? keys : []).map((k) => {
        const e = renderEmail(
          k,
          { name: "Priya" },
          {
            siteUrl: site,
            unsubscribeUrl: ALWAYS_SENT.includes(k)
              ? undefined
              : `${site}/unsubscribe-sample`,
          },
        );
        return (
          <Panel key={k} title={EMAIL_LABELS[k]}>
            <p className="text-xs text-muted">
              Subject: <b className="text-brand">{e.subject}</b> ·{" "}
              {ALWAYS_SENT.includes(k)
                ? "Always sent"
                : "Follows the member's email choices"}
            </p>
            <iframe
              title={`Preview: ${EMAIL_LABELS[k]}`}
              srcDoc={e.html}
              sandbox=""
              className="mt-2 h-[430px] w-full rounded-xl border border-line bg-white"
            />
            <form action={sendTestEmail} className="mt-2">
              <input type="hidden" name="key" value={k} />
              <ABtn variant="ghost">Send a test to me</ABtn>
            </form>
          </Panel>
        );
      })}
    </>
  );
}
