import type { Metadata } from "next";
import Link from "next/link";
import { PushButton } from "@/components/app/PushButton";
import { Button, Cap, Card, Flash } from "@/components/app/ui";
import { flags } from "@/lib/flags";
import { getContext } from "@/lib/app";
import {
  saveNotificationPrefs,
  setSharing,
  setUnits,
  updateProfileName,
} from "../actions";

export const metadata: Metadata = { title: "Profile" };

const input =
  "mt-1 min-h-11 w-full rounded-2xl border-2 border-line bg-surface px-3 text-sm font-normal";

function Toggle({
  name,
  label,
  hint,
  on,
}: {
  name: string;
  label: string;
  hint?: string;
  on: boolean;
}) {
  return (
    <label className="flex min-h-12 items-center gap-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={on}
        className="size-5 accent-brand"
      />
      <span className="text-xs">
        <b className="block text-brand">{label}</b>
        {hint ? <span className="text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { supabase, user, profile } = await getContext();
  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  const q = (prefs?.quiet_hours ?? { start: "21:00", end: "07:00" }) as {
    start: string;
    end: string;
  };

  return (
    <>
      <h1 className="sr-only">Profile</h1>
      {sp.saved ? <Flash>Saved.</Flash> : null}
      {sp.error === "phone" ? (
        <Flash tone="error">Enter a valid phone number.</Flash>
      ) : null}
      {sp.error === "name" ? (
        <Flash tone="error">Please enter your first and last name.</Flash>
      ) : null}

      <Card>
        <Cap>Your details</Cap>
        <form action={updateProfileName} className="mt-2 flex flex-col gap-3">
          <label className="text-xs font-bold text-brand">
            First name
            <input
              name="first_name"
              defaultValue={profile?.first_name ?? ""}
              required
              className={input}
            />
          </label>
          <label className="text-xs font-bold text-brand">
            Last name
            <input
              name="last_name"
              defaultValue={profile?.last_name ?? ""}
              required
              className={input}
            />
          </label>
          <label className="text-xs font-bold text-brand">
            Phone number
            <input
              name="phone"
              type="tel"
              required
              defaultValue={profile?.phone ?? ""}
              autoComplete="tel"
              className={input}
            />
          </label>
          <p className="text-[10.5px] text-muted">Signed in as {user.email}.</p>
          <Button variant="primary">Save details</Button>
        </form>
      </Card>

      <Card>
        <Cap>Units</Cap>
        <form action={setUnits} className="mt-2 flex flex-col gap-2">
          {[
            ["metric", "Kilograms and centimetres"],
            ["imperial", "Pounds and inches"],
          ].map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-3 text-xs">
              <input
                type="radio"
                name="units"
                value={value}
                defaultChecked={(profile?.units ?? "metric") === value}
                className="size-5 accent-brand"
              />
              <span className="font-bold text-brand">{label}</span>
            </label>
          ))}
          <Button variant="primary">Save units</Button>
        </form>
      </Card>

      <Card id="sharing" className="scroll-mt-4">
        <Cap>Sharing with your coach</Cap>
        <form action={setSharing} className="mt-2 flex flex-col gap-1">
          <label className="flex min-h-12 items-start gap-3 text-xs">
            <input
              type="checkbox"
              name="records"
              defaultChecked={Boolean(profile?.coach_access_at)}
              className="mt-0.5 size-5 accent-brand"
            />
            <span>
              <b className="block text-brand">My answers and progress</b>Lets your CK
              coach see your questionnaire, daily check-ins, weight and measurements so
              they can support you.
            </span>
          </label>
          <label className="flex min-h-12 items-start gap-3 text-xs">
            <input
              type="checkbox"
              name="photos"
              defaultChecked={Boolean(profile?.photo_coach_access_at)}
              className="mt-0.5 size-5 accent-brand"
            />
            <span>
              <b className="block text-brand">My progress photos</b>Optional. Only if you
              use photos. Off by default.
            </span>
          </label>
          <p className="text-[10.5px] text-muted">
            Turn either off and your coach loses access immediately. Every time staff open
            your record, it is logged.
          </p>
          <Button variant="primary" className="mt-1">
            Save sharing choices
          </Button>
        </form>
      </Card>

      <Card>
        <Cap>Membership</Cap>
        <p className="mt-1 text-xs text-muted">
          See your plan, manage billing or cancel.
        </p>
        <Link
          href="/membership"
          className="mt-2 inline-flex min-h-11 items-center rounded-button border-2 border-line px-4 text-xs font-bold text-brand"
        >
          Manage membership
        </Link>
      </Card>

      <Card>
        <Cap>Notifications</Cap>
        <form action={saveNotificationPrefs} className="mt-1 flex flex-col">
          <Toggle name="workout" label="Workout reminders" on={prefs?.workout ?? true} />
          <Toggle name="water" label="Water reminders" on={prefs?.water ?? false} />
          <Toggle
            name="weekly_checkin"
            label="Weekly check-in"
            on={prefs?.weekly_checkin ?? true}
          />
          <Toggle
            name="new_content"
            label="New trainings and content"
            on={prefs?.new_content ?? true}
          />
          {flags.nutrition_tracker_enabled ? (
            <>
              <input type="hidden" name="nutrition_present" value="1" />
              <Toggle
                name="nutrition"
                label="Nutrition reminders"
                hint="At most one gentle reminder a day."
                on={prefs?.nutrition ?? true}
              />
            </>
          ) : null}
          <Toggle
            name="community"
            label="Community activity"
            hint="Comments, replies and reactions on your posts."
            on={prefs?.community ?? true}
          />
          <Toggle
            name="marketing"
            label="Offers and news"
            hint="Optional. You can turn this off any time."
            on={prefs?.marketing ?? false}
          />
          <p className="mt-2 text-[11px] font-bold text-brand">How we reach you</p>
          <Toggle name="email" label="Email" on={prefs?.email ?? true} />
          <Toggle
            name="sms"
            label="Text message"
            hint="Only if you opt in."
            on={prefs?.sms ?? false}
          />
          <Toggle name="push" label="Push notifications" on={prefs?.push ?? false} />
          {process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? (
            <PushButton publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
          ) : null}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs font-bold text-brand">
              Quiet from
              <input
                type="time"
                name="quiet_start"
                defaultValue={q.start}
                className={input}
              />
            </label>
            <label className="text-xs font-bold text-brand">
              Until
              <input
                type="time"
                name="quiet_end"
                defaultValue={q.end}
                className={input}
              />
            </label>
          </div>
          <p className="my-2 text-[10.5px] text-muted">
            Billing and security messages are always sent.
          </p>
          <Button variant="primary">Save preferences</Button>
        </form>
      </Card>

      <Card>
        <Cap>Help and privacy</Cap>
        <ul className="mt-1 flex flex-col text-xs font-bold text-brand">
          <li>
            <Link
              href="/accountability/help"
              className="flex min-h-11 items-center underline underline-offset-4"
            >
              Talk to a real person
            </Link>
          </li>
          <li>
            <Link
              href="/privacy"
              className="flex min-h-11 items-center underline underline-offset-4"
            >
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link
              href="/terms"
              className="flex min-h-11 items-center underline underline-offset-4"
            >
              Terms and safety notice
            </Link>
          </li>
          <li>
            <a
              href="/api/account/export"
              className="flex min-h-11 items-center underline underline-offset-4"
            >
              Download my data
            </a>
          </li>
        </ul>
      </Card>

      <Link
        href="/profile/delete"
        className="inline-flex min-h-11 items-center justify-center rounded-button border-2 border-danger px-4 text-xs font-bold text-danger"
      >
        Delete my account
      </Link>

      <form action="/auth/signout" method="post">
        <Button variant="ghost" className="w-full">
          Log out
        </Button>
      </form>
    </>
  );
}
