import type { Metadata } from "next";
import { DEFAULT_NUDGE_SMS, DEFAULT_WELCOME_SMS, renderSms, smsSegments } from "@ck/core";
import { ABtn, Flash, H1, Panel, Table, aInput, td } from "@/components/admin/ui";
import { OPS, requireStaff } from "@/lib/admin";
import { loadSmsSettings, readyToSend } from "@/lib/sms";
import { saveSmsSettings, sendSmsTest } from "./actions";

export const metadata: Metadata = { title: "Text messages" };

const lab = "text-xs font-bold text-brand";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-CA", {
    timeZone: "America/Vancouver",
    dateStyle: "medium",
    timeStyle: "short",
  });

export default async function AdminSms({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; tested?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { db } = await requireStaff(OPS);
  const { row, missing } = await loadSmsSettings(db);

  if (missing)
    return (
      <>
        <H1>Text messages</H1>
        <Panel title="One step first">
          <p className="text-sm">
            Paste and run <code>supabase/migrations/20261121000031_sms.sql</code> (SQL
            0031) in the Supabase SQL Editor, then reload this page. It creates a private
            place for the Twilio keys that members and staff can never read from the
            browser.
          </p>
        </Panel>
      </>
    );

  const ready = readyToSend(row);
  const body = row?.welcome_body ?? DEFAULT_WELCOME_SMS;
  const preview = renderSms(body, { firstName: "Priya" });
  const seg = smsSegments(preview);
  const nudgeBody = row?.nudge_body ?? DEFAULT_NUDGE_SMS;
  const nudgePreview = renderSms(nudgeBody, { firstName: "Priya" });
  const nudgeSeg = smsSegments(nudgePreview);
  const { count: optedIn } = await db
    .from("notification_preferences")
    .select("user_id", { count: "exact", head: true })
    .eq("sms", true);
  const { data: recent } = await db
    .from("sms_messages")
    .select("created_at,kind,to_masked,status,error")
    .order("created_at", { ascending: false })
    .limit(20);
  const log = (recent ?? []) as {
    created_at: string;
    kind: string;
    to_masked: string;
    status: string;
    error: string | null;
  }[];

  return (
    <>
      <H1>Text messages</H1>
      {sp.saved ? <Flash>Saved.</Flash> : null}
      {sp.tested ? <Flash>Test text sent. Check your phone.</Flash> : null}
      {sp.error ? <Flash bad>{sp.error}</Flash> : null}

      <Panel title="Status">
        <p className="text-sm">
          Welcome texts are{" "}
          <b className={row?.enabled ? "text-success" : "text-danger"}>
            {row?.enabled ? "ON" : "OFF"}
          </b>
          .{" "}
          {"problem" in ready
            ? `Setup not complete: ${ready.problem}`
            : "Twilio keys are saved and readable."}
        </p>
        <p className="mt-1 text-xs text-muted">
          When it is on, each new member gets one text after she confirms her email and
          finishes the sign-up questions. Only numbers in the countries below are texted,
          at most the daily limit in 24 hours, and never twice to the same member.
        </p>
      </Panel>

      <form action={saveSmsSettings} className="flex flex-col gap-4">
        <Panel title="Twilio keys (Twilio Console -> Account info)">
          <div className="grid gap-3 md:grid-cols-2">
            <label className={lab}>
              Account SID (starts with AC)
              <input
                name="account_sid"
                defaultValue={row?.account_sid ?? ""}
                autoComplete="off"
                spellCheck={false}
                className={aInput}
                placeholder="AC..."
              />
            </label>
            <label className={lab}>
              Auth Token
              <input
                name="auth_token"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                className={aInput}
                placeholder={
                  row?.auth_token_hint
                    ? `Saved (ends in ${row.auth_token_hint}). Leave empty to keep it.`
                    : "Paste the Auth Token"
                }
              />
            </label>
            <label className={lab}>
              Twilio phone number (with country code)
              <input
                name="from_number"
                defaultValue={row?.from_number ?? ""}
                className={aInput}
                placeholder="+16045550123"
              />
            </label>
            <label className={lab}>
              Messaging Service SID (optional, starts with MG; used instead of the number)
              <input
                name="messaging_service_sid"
                defaultValue={row?.messaging_service_sid ?? ""}
                autoComplete="off"
                spellCheck={false}
                className={aInput}
                placeholder="MG..."
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-muted">
            The Auth Token is stored encrypted and is never shown again. To change it,
            paste the new one. Only owners and admins can open this page, and every change
            is in the audit log (without the keys).
          </p>
        </Panel>

        <Panel title="Welcome text">
          <label className="flex items-center gap-2 text-sm font-bold text-brand">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={row?.enabled ?? false}
            />
            Send a welcome text when a new member finishes signing up
          </label>
          <label className={`${lab} mt-3 block`}>
            Message ({"{{first_name}}"} becomes her first name; &quot;Reply STOP to opt
            out.&quot; is added if you leave it out)
            <textarea
              name="welcome_body"
              rows={3}
              maxLength={480}
              defaultValue={body}
              className={`${aInput} mt-1 py-2 font-normal`}
            />
          </label>
          <p className="mt-2 text-xs text-muted">
            Preview (saved text): <i>{preview}</i>
            <br />
            {seg.segments === 1 ? "1 text" : `${seg.segments} texts`} per member
            {seg.unicode ? " (emoji or special characters make texts shorter)" : ""}.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className={lab}>
              Countries that may be texted (calling codes, comma separated; 1 = Canada and
              the US)
              <input
                name="country_codes"
                defaultValue={(row?.allowed_country_codes ?? ["1"]).join(", ")}
                className={aInput}
              />
            </label>
            <label className={lab}>
              Most texts in 24 hours (a safety limit against fake sign-ups)
              <input
                name="daily_limit"
                type="number"
                min={1}
                max={5000}
                defaultValue={row?.daily_limit ?? 100}
                className={aInput}
              />
            </label>
          </div>
        </Panel>
        <Panel title="Missed-workout text (only members who turned on texts)">
          {row?.nudge_ready ? (
            <>
              <label className="flex items-center gap-2 text-sm font-bold text-brand">
                <input
                  type="checkbox"
                  name="nudge_enabled"
                  defaultChecked={row?.nudge_enabled ?? false}
                />
                Text members who have not worked out for a few days
              </label>
              <p className="mt-1 text-xs text-muted">
                Goes out once a day at about 10 am Vancouver time, only to members who
                turned ON &quot;Text message&quot; in Profile (their consent;{" "}
                {optedIn ?? 0} members have it on today). Everyone else is on the Call
                today list in Accountability.
              </p>
              <label className={`${lab} mt-3 block`}>
                Message ({"{{first_name}}"} becomes her first name)
                <textarea
                  name="nudge_body"
                  rows={3}
                  maxLength={480}
                  defaultValue={nudgeBody}
                  className={`${aInput} mt-1 py-2 font-normal`}
                />
              </label>
              <p className="mt-2 text-xs text-muted">
                Preview (saved text): <i>{nudgePreview}</i>
                <br />
                {nudgeSeg.segments === 1 ? "1 text" : `${nudgeSeg.segments} texts`} per
                member.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className={lab}>
                  Send after this many days without a workout
                  <input
                    name="nudge_after_days"
                    type="number"
                    min={2}
                    max={30}
                    defaultValue={row?.nudge_after_days ?? 3}
                    className={aInput}
                  />
                </label>
                <label className={lab}>
                  At most one every (days)
                  <input
                    name="nudge_every_days"
                    type="number"
                    min={3}
                    max={60}
                    defaultValue={row?.nudge_every_days ?? 7}
                    className={aInput}
                  />
                </label>
              </div>
            </>
          ) : (
            <p className="text-sm">
              Run SQL 0032 (<code>20261121000032_calls_and_nudge_texts.sql</code>) in
              Supabase to turn this on.
            </p>
          )}
        </Panel>
        <ABtn variant="primary" className="self-start">
          Save text message settings
        </ABtn>
      </form>

      <Panel title="Send a test text">
        <form action={sendSmsTest} className="flex flex-wrap items-end gap-2">
          <label className={lab}>
            Your phone number
            <input name="test_to" className={aInput} placeholder="+16045550123" />
          </label>
          <ABtn>Send test</ABtn>
        </form>
        <p className="mt-2 text-xs text-muted">
          Uses the saved settings (save first). The test works even while welcome texts
          are off. Twilio trial accounts can only text numbers verified in Twilio.
        </p>
      </Panel>

      <Panel title="Before you switch it on">
        <ul className="list-disc pl-5 text-xs text-muted">
          <li>
            Canadian and US numbers need a registered sender in Twilio (A2P 10DLC for a
            local number, or toll-free verification). Unregistered numbers are often
            blocked by the phone companies.
          </li>
          <li>
            Add a line to the Privacy Policy that we text members about their account and
            use Twilio to send texts (the policy does not mention texts yet).
          </li>
          <li>
            Members whose phone number has no country code and is not a 10-digit Canadian
            or US number are skipped, so nobody is texted by guesswork.
          </li>
        </ul>
      </Panel>

      <Panel title="Recent texts (last 20)">
        {log.length ? (
          <Table head={["When", "Type", "To", "Result"]}>
            {log.map((m, i) => (
              <tr key={i}>
                <td className={td}>{when(m.created_at)}</td>
                <td className={td}>
                  {m.kind === "test"
                    ? "Test"
                    : m.kind === "nudge"
                      ? "Missed workout"
                      : "Welcome"}
                </td>
                <td className={td}>{m.to_masked}</td>
                <td className={td}>
                  {m.status === "sent"
                    ? "Sent"
                    : m.status === "sending"
                      ? "Sending"
                      : "Failed"}
                  {m.error ? (
                    <span className="block text-xs text-danger">{m.error}</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="text-sm text-muted">No texts yet.</p>
        )}
      </Panel>
    </>
  );
}
