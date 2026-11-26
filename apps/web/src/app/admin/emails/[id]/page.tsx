import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { renderCampaign } from "@ck/core";
import { ABtn, Flash, H1, Panel } from "@/components/admin/ui";
import { OPS, requireStaff } from "@/lib/admin";
import {
  audiencePeople,
  usesNewsConsent,
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
    {
      siteUrl: site,
      unsubscribeUrl: `${site}/unsubscribe-sample`,
      reason: usesNewsConsent(c.audience ?? {})
        ? "You are getting this because you get news about trainings and the app."
        : undefined,
    },
  );
  const reach = c.status === "draft" ? await audiencePeople(db, c.audience ?? {}) : null;
  const estimate = reach?.total ?? null;
  // Plain-English summary of who gets it.
  const a = c.audience ?? {};
  const trainingId = a.has_training ?? a.lacks_training ?? a.training;
  const { data: tp } = trainingId
    ? await db.from("programs").select("title").eq("id", trainingId).maybeSingle()
    : { data: null };
  const { data: tg } = a.tag_id
    ? await db.from("member_tags").select("name").eq("id", a.tag_id).maybeSingle()
    : { data: null };
  const who = [
    a.plan === "free" ? "Free members" : a.plan === "member" ? "CK Members" : "Everyone",
    a.has_training ? `who have ${tp?.title ?? "the training"}` : "",
    a.lacks_training ? `who do NOT have ${tp?.title ?? "the training"}` : "",
    a.given_only ? `given ${tp?.title ?? "the training"}` : "",
    tg?.name ? `tagged ${tg.name}` : "",
    usesNewsConsent(a)
      ? '(with "New trainings and content" on)'
      : "(who turned on Offers and news)",
  ]
    .filter(Boolean)
    .join(" ");
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
        <p className="mt-1 text-sm">
          Who gets it: <b>{who}</b>.
        </p>
        {reach?.people.length ? (
          <details className="mt-1">
            <summary className="cursor-pointer text-xs font-bold text-brand underline">
              See who ({reach.total})
            </summary>
            <ul className="mt-2 max-h-56 overflow-y-auto text-xs">
              {reach.people.map((p) => (
                <li key={p.email + p.name} className="py-0.5">
                  {p.name} <span className="text-muted">{p.email}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
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
