import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card, Flash } from "@/components/app/ui";
import { getContext } from "@/lib/app";
import { sendHelpRequest } from "./actions";

export const metadata: Metadata = { title: "Talk to a real person" };

const TOPICS = [
  ["help", "General help"],
  ["coaching", "Coaching with CK"],
  ["billing", "Billing or membership"],
  ["other", "Something else"],
] as const;

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{
    topic?: string;
    program?: string;
    sent?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const { supabase, user } = await getContext();
  const { data: mine } = await supabase
    .from("support_requests")
    .select("id,category,message,status,staff_reply,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <>
      <h1 className="font-display text-[19px] text-brand">Talk to a real person</h1>
      <p className="text-xs text-muted">
        Tell us what you need and someone from CK will get back to you.
      </p>
      {sp.sent ? (
        <Flash>Thank you. We have your message and will reply soon.</Flash>
      ) : null}
      {sp.error ? (
        <Flash tone="error">
          {sp.error === "message"
            ? "Please write a short message."
            : "We could not send that. Please try again."}
        </Flash>
      ) : null}
      <Card>
        <form action={sendHelpRequest} className="flex flex-col gap-3">
          <input type="hidden" name="program" value={sp.program ?? ""} />
          <label className="text-xs font-bold text-brand">
            What is this about?
            <select
              name="category"
              defaultValue={sp.topic ?? "help"}
              className="mt-1 min-h-11 w-full rounded-2xl border-2 border-line bg-surface px-3 text-sm font-normal"
            >
              {TOPICS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-brand">
            Your message
            <textarea
              name="message"
              rows={5}
              maxLength={2000}
              required
              className="mt-1 w-full rounded-2xl border-2 border-line bg-surface p-3 text-sm font-normal"
            />
          </label>
          <p className="text-[10.5px] text-muted">
            Please do not include medical details. For urgent health concerns, contact a
            health professional.
          </p>
          <Button variant="primary" className="min-h-12">
            Send message
          </Button>
        </form>
      </Card>
      {(mine ?? []).length > 0 ? (
        <Card>
          <h2 className="text-[13px] font-bold text-brand">Your messages</h2>
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {(
              mine as {
                id: string;
                message: string;
                status: string;
                staff_reply: string | null;
              }[]
            ).map((m) => (
              <li key={m.id} className="py-2 text-xs">
                <p className="font-semibold">{m.message.slice(0, 120)}</p>
                {m.staff_reply ? (
                  <p className="mt-1 rounded-2xl bg-page p-2">
                    CK replied: {m.staff_reply}
                  </p>
                ) : (
                  <p className="text-muted">
                    {m.status === "resolved" ? "Resolved" : "Waiting for a reply"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Link
        href="/profile"
        className="text-center text-xs font-bold text-brand underline underline-offset-4"
      >
        Back to profile
      </Link>
    </>
  );
}
