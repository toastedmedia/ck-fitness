import type { Metadata } from "next";
import { EMAIL_LABELS, ALWAYS_SENT, renderEmail, type EmailKey } from "@ck/core";
import { ABtn, Flash, H1, Panel } from "@/components/admin/ui";
import { OPS, requireStaff } from "@/lib/admin";
import { emailConfigured } from "@/lib/email/send";
import { sendTestEmail } from "../actions";

export const metadata: Metadata = { title: "Emails" };

/** Every email the app sends, shown as members see it, with a button to send yourself a test. */
export default async function AdminEmails({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;
  await requireStaff(OPS);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.chardikalafitness.com";
  const keys = Object.keys(EMAIL_LABELS) as EmailKey[];
  return (
    <>
      <H1>Emails</H1>
      {sp.sent ? (
        <Flash>Test email sent to {sp.sent}. Check your inbox (and spam).</Flash>
      ) : null}
      {sp.error ? (
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
      <p className="text-sm text-muted">
        These go out automatically. Reminder and nudge emails follow each member&apos;s
        choices in Profile and include a one-click turn-off link. Billing and support
        emails always send. No email ever contains health details.
      </p>
      {keys.map((k) => {
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
