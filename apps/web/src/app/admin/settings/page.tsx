import type { Metadata } from "next";
import { mergeGoals } from "@ck/core";
import { ABtn, Flash, H1, Panel, aInput } from "@/components/admin/ui";
import { OPS, requireStaff } from "@/lib/admin";
import { flags } from "@/lib/flags";
import { saveSettings } from "../actions";

export const metadata: Metadata = { title: "Settings" };

const lab = "text-xs font-bold text-brand";

export default async function AdminSettings({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { supabase } = await requireStaff(OPS);
  const { data } = await supabase.from("app_settings").select("key,value");
  const s = new Map(
    ((data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]),
  );
  const g = mergeGoals(s.get("daily_goals"));
  const text = (k: string, d = "") => String(s.get(k) ?? d);
  return (
    <>
      <H1>Settings</H1>
      {sp.saved ? <Flash>Saved. Changes apply straight away.</Flash> : null}
      {sp.error ? <Flash bad>That did not save. Please try again.</Flash> : null}
      <form action={saveSettings} className="flex flex-col gap-4">
        <Panel title="Membership and support">
          <div className="grid gap-3 md:grid-cols-2">
            <label className={lab}>
              Price shown in the app
              <input
                name="price"
                defaultValue={text("membership_price_display", "$29.99 CAD / month")}
                className={aInput}
              />
            </label>
            <label className={lab}>
              Support email
              <input
                name="support_email"
                defaultValue={text("support_email")}
                className={aInput}
              />
            </label>
            <label className={lab}>
              Privacy Policy link
              <input
                name="privacy_url"
                defaultValue={text("privacy_url", "/privacy")}
                className={aInput}
              />
            </label>
            <label className={lab}>
              Terms link
              <input
                name="terms_url"
                defaultValue={text("terms_url", "/terms")}
                className={aInput}
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-muted">
            The price shown here is display text. The amount actually charged is set in
            Stripe.
          </p>
        </Panel>
        <Panel title="Daily goals and Today's CK Score">
          <div className="grid gap-3 md:grid-cols-4">
            <label className={lab}>
              Water target (mL)
              <input
                name="water"
                type="number"
                defaultValue={g.waterTargetMl}
                className={aInput}
              />
            </label>
            <label className={lab}>
              Step goal
              <input
                name="steps"
                type="number"
                defaultValue={g.stepGoal}
                className={aInput}
              />
            </label>
            <label className={lab}>
              Weigh-in every (days)
              <input
                name="weigh_every"
                type="number"
                defaultValue={g.weighInEveryDays}
                className={aInput}
              />
            </label>
            <label className={lab}>
              Remind from day
              <input
                name="weigh_from"
                type="number"
                defaultValue={g.weighInRemindFromDay}
                className={aInput}
              />
            </label>
            <label className={lab}>
              Workout weight
              <input
                name="w_workout"
                type="number"
                defaultValue={g.weights.workout}
                className={aInput}
              />
            </label>
            <label className={lab}>
              Water weight
              <input
                name="w_water"
                type="number"
                defaultValue={g.weights.water}
                className={aInput}
              />
            </label>
            <label className={lab}>
              Steps weight
              <input
                name="w_steps"
                type="number"
                defaultValue={g.weights.steps}
                className={aInput}
              />
            </label>
            <label className={lab}>
              Check-in weight
              <input
                name="w_checkin"
                type="number"
                defaultValue={g.weights.checkin}
                className={aInput}
              />
            </label>
            <label className={lab}>
              Weigh-in weight
              <input
                name="w_weigh"
                type="number"
                defaultValue={g.weights.weigh}
                className={aInput}
              />
            </label>
          </div>
        </Panel>
        <ABtn variant="primary" className="self-start">
          Save settings
        </ABtn>
      </form>
      <Panel title="Feature flags (set in code, off until their phase ships)">
        <ul className="text-sm">
          {Object.entries(flags).map(([k, v]) => (
            <li key={k} className="py-1">
              <code>{k}</code>: {v ? "on" : "off"}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
