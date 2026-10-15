import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { renderCampaign } from "@ck/core";
import { ABtn, Flash, H1, Panel } from "@/components/admin/ui";
import { OPS, requireStaff } from "@/lib/admin";
import {
  audienceUserIds,
  imageUrlOf,
  siteBase,
  toCampaign,
  type CampaignRow,
} from "@/lib/email/campaign";
import { emailConfigured } from "@/lib/email/send";
import {
  cancelCampaign,
  deleteCampaign,
  duplicateCampaign,
  launchCampaign,
  sendCampaignTest,
} from "../../actions";

export const metadata: Metadata = { title: "Email" };

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    saved?: string;
    test?: string;
    started?: string;
    error?: string;
    confirm?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, db } = await requireStaff(OPS);
  const { data } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const c = data as CampaignRow;
  const site = siteBase();
  const e = renderCampaign(
    { ...toCampaign(c), imageUrl: imageUrlOf(c.image_path) },
    { name: "Priya" },
    { siteUrl: site, unsubscribeUrl: `${site}/unsubscribe-sample` },
  );
  const estimate =
    c.status === "draft" ? (await audienceUserIds(db, c.audience ?? {})).length : null;
  const draft = c.status === "draft";
  return (
    <>
      <Link href="/admin/emails" className="text-sm font-bold text-brand underline">
        ← All emails
      </Link>
      <H1>{c.name}</H1>
      {sp.saved ? <Flash>Saved.</Flash> : null}
      {sp.test ? (
        <Flash>Test sent to {sp.test}. Check your inbox (and spam).</Flash>
      ) : null}
      {sp.started ? (
        <Flash>
          Sending started to {sp.started} {sp.started === "1" ? "member" : "members"}. Big
          lists finish in the background within a few minutes.
        </Flash>
      ) : null}
      {sp.error ? (
        <Flash bad>
          {sp.error === "send"
            ? "Email sending is not connected (RESEND_API_KEY) or the test failed."
            : "Something went wrong. Try again."}
        </Flash>
      ) : null}
      {!emailConfigured() ? (
        <Flash bad>RESEND_API_KEY is not set in Vercel yet.</Flash>
      ) : null}
      <Panel title="Status">
        <p className="text-sm">
          <b className="capitalize text-brand">{c.status}</b>
          {draft ? (
            <>
              {" "}
              · about <b>{estimate}</b> member{estimate === 1 ? "" : "s"} would receive it
            </>
          ) : (
            <>
              {" "}
              · {c.sent} sent, {c.failed} failed, {c.total} planned
            </>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {draft ? (
            <>
              <Link
                href={`/admin/emails/${id}/edit`}
                className="inline-flex min-h-10 items-center rounded-button border-2 border-line px-4 text-xs font-bold text-brand"
              >
                Edit
              </Link>
              <form action={sendCampaignTest.bind(null, id)}>
                <ABtn>Send a test to me</ABtn>
              </form>
              {sp.confirm ? null : (
                <Link
                  href={`/admin/emails/${id}?confirm=1`}
                  className="inline-flex min-h-10 items-center rounded-button bg-brand px-4 text-xs font-bold text-on-brand"
                >
                  Send to members…
                </Link>
              )}
            </>
          ) : null}
          {c.status === "sending" ? (
            <form action={cancelCampaign.bind(null, id)}>
              <ABtn variant="danger">Stop sending</ABtn>
            </form>
          ) : null}
          <form action={duplicateCampaign.bind(null, id)}>
            <ABtn>Duplicate</ABtn>
          </form>
          {draft || c.status === "cancelled" ? (
            <form action={deleteCampaign.bind(null, id)}>
              <ABtn variant="danger">Delete</ABtn>
            </form>
          ) : null}
        </div>
        {draft && sp.confirm ? (
          <form
            action={launchCampaign.bind(null, id)}
            className="mt-3 rounded-xl border-2 border-danger p-3"
          >
            <p className="text-sm">
              This will email about <b>{estimate}</b> member{estimate === 1 ? "" : "s"}{" "}
              and cannot be undone. Have you sent yourself a test?
            </p>
            <div className="mt-2 flex gap-2">
              <ABtn variant="primary">Yes, send now</ABtn>
              <Link
                href={`/admin/emails/${id}`}
                className="inline-flex min-h-10 items-center rounded-button border-2 border-line px-4 text-xs font-bold text-brand"
              >
                Cancel
              </Link>
            </div>
          </form>
        ) : null}
      </Panel>
      <Panel title="Preview">
        <p className="text-xs text-muted">
          Subject: <b className="text-brand">{e.subject}</b>
        </p>
        <iframe
          title="Email preview"
          srcDoc={e.html}
          sandbox=""
          className="mt-2 h-[560px] w-full rounded-xl border border-line bg-white"
        />
      </Panel>
    </>
  );
}
