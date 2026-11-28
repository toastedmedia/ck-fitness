import type { Metadata } from "next";
import Link from "next/link";
import { BOOKING_TZ, WEEKDAYS, dayKey, dayLabel, timeLabel } from "@ck/core";
import { ABtn, Flash, H1, Panel, Status, Tile, aInput } from "@/components/admin/ui";
import { requireStaff } from "@/lib/admin";
import { APP_URL, calendarFeedToken, freeSlots, type BookingRow } from "@/lib/bookings";
import { CRM_ROLES, contactName } from "@/lib/leads";
import {
  addBlock,
  addWindow,
  removeBlock,
  removeWindow,
  resendConfirmation,
  saveBookingSettings,
  setBookingStatus,
  staffBook,
  staffCancel,
  staffMove,
} from "./actions";

export const metadata: Metadata = { title: "Calendar" };

const TZ = BOOKING_TZ;
const digits = (p: string | null) => (p ?? "").replace(/\D/g, "");
const ERRORS: Record<string, string> = {
  time: "Pick a day and a time.",
  email: "Add an email so we can send the confirmation.",
  taken: "That time is already booked. Pick another.",
  closed: "Online booking is off.",
  invalid: "That did not work. Try again.",
  error: "Could not save. Run the latest database update (0036) if this keeps happening.",
  window: "Pick at least one day, and an end time after the start time.",
  block: "Check the dates: the last day must be on or after the first.",
  save: "Could not save. Try again.",
  missing: "That booking no longer exists.",
};
const SAVED: Record<string, string> = {
  booked: "Booked. It is in the calendar and the lead is in Leads.",
  status: "Updated.",
  cancelled: "Cancelled.",
  moved: "Moved, and the new time was emailed.",
  emailed: "Confirmation email sent again.",
  settings: "Settings saved.",
  hours: "Opening hours saved.",
  block: "Days off saved.",
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    saved?: string;
    error?: string;
    book?: string;
    past?: string;
  }>;
}) {
  const sp = await searchParams;
  const { db } = await requireStaff([...CRM_ROLES]);
  const settingsView = sp.view === "settings";
  const now = new Date();
  const st = await freeSlots(db, now);
  const past = sp.past === "1";
  const { data: rows } = await db
    .from("bookings")
    .select("*")
    .gte(
      "starts_at",
      new Date(now.getTime() - (past ? 30 : 0.5) * 86400000).toISOString(),
    )
    .lte(
      "starts_at",
      past ? now.toISOString() : new Date(now.getTime() + 60 * 86400000).toISOString(),
    )
    .order("starts_at", { ascending: !past })
    .limit(400);
  const bookings = ((rows ?? []) as BookingRow[]).filter(
    (b) => past || b.status !== "cancelled" || new Date(b.starts_at) > now,
  );
  const byDay = new Map<string, BookingRow[]>();
  for (const b of bookings) {
    const d = dayKey(new Date(b.starts_at), TZ);
    byDay.set(d, [...(byDay.get(d) ?? []), b]);
  }
  const { data: prefillRow } = sp.book
    ? await db
        .from("crm_contacts")
        .select("id, first_name, last_name, email, phone, goal")
        .eq("id", sp.book)
        .maybeSingle()
    : { data: null };
  const prefill = prefillRow as {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    goal: string | null;
  } | null;
  const { data: winRows } = await db
    .from("booking_availability")
    .select("id, weekday, start_time, end_time")
    .order("weekday")
    .order("start_time");
  const windows = (winRows ?? []) as {
    id: string;
    weekday: number;
    start_time: string;
    end_time: string;
  }[];
  const feed = calendarFeedToken();
  const feedUrl = feed ? `${APP_URL}/api/booking/feed/${feed}.ics` : null;
  const today = dayKey(now, TZ);
  const upcoming = bookings.filter(
    (b) => b.status === "booked" && new Date(b.starts_at) > now,
  );
  const openSlots = st.days.reduce((a, d) => a + d.slots.length, 0);
  const field = `${aInput} mt-1 font-normal`;
  const t12 = (hhmm: string) => timeLabel(`2026-01-01T${hhmm}:00Z`, "UTC");

  const tabs = (
    <div className="flex gap-1 text-sm">
      {[
        ["Bookings", "/admin/calendar"],
        ["Hours and settings", "/admin/calendar?view=settings"],
      ].map(([label, href]) => (
        <Link
          key={href}
          href={href!}
          aria-current={
            (label === "Hours and settings") === settingsView ? "page" : undefined
          }
          className={`rounded-full px-4 py-1.5 font-bold ${(label === "Hours and settings") === settingsView ? "bg-brand text-on-brand" : "border-2 border-line text-brand"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );

  return (
    <>
      <H1
        right={
          <Link
            href="/admin/leads"
            className="inline-flex min-h-10 items-center rounded-button border-2 border-line px-4 text-xs font-bold text-brand"
          >
            Leads
          </Link>
        }
      >
        Calendar
      </H1>
      <p className="text-sm text-muted">
        Free consultations booked on{" "}
        <a
          className="font-bold underline"
          href="https://chardikalafitness.com/consult"
          target="_blank"
          rel="noopener"
        >
          chardikalafitness.com/consult
        </a>{" "}
        and the ones you add here. All times are Pacific (Vancouver).
      </p>
      {!st.ready ? (
        <Flash bad>
          The calendar is not ready yet. Run the latest database update (0036).
        </Flash>
      ) : null}
      {sp.saved ? <Flash>{SAVED[sp.saved] ?? "Saved."}</Flash> : null}
      {sp.error ? <Flash bad>{ERRORS[sp.error] ?? "Could not save."}</Flash> : null}
      {st.ready && !st.row.enabled ? (
        <Flash bad>
          Online booking is OFF: the website still shows the old booking calendar. Set
          your hours, then switch it on under Hours and settings.
        </Flash>
      ) : null}
      {st.ready && st.row.enabled && !windows.length ? (
        <Flash bad>
          No opening hours yet, so nobody can book. Add them under Hours and settings.
        </Flash>
      ) : null}
      {tabs}

      {!settingsView ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Tile
              value={
                upcoming.filter((b) => dayKey(new Date(b.starts_at), TZ) === today).length
              }
              label="Today"
            />
            <Tile value={upcoming.length} label="Upcoming (60 days)" />
            <Tile
              value={st.row.enabled ? openSlots : "Off"}
              label={`Open times (next ${st.row.max_days_ahead} days)`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              className={`font-bold ${past ? "underline" : "text-brand"}`}
              href="/admin/calendar"
            >
              Upcoming
            </Link>
            ·
            <Link
              className={`font-bold ${past ? "text-brand" : "underline"}`}
              href="/admin/calendar?past=1"
            >
              Past 30 days
            </Link>
            <a
              href="#book"
              className="ml-auto inline-flex min-h-10 items-center rounded-button bg-brand px-4 text-xs font-bold text-on-brand"
            >
              + Add a booking
            </a>
          </div>

          {!byDay.size ? (
            <Panel>
              <p className="text-sm text-muted">
                {past
                  ? "No consultations in the last 30 days."
                  : "No consultations booked yet."}
              </p>
            </Panel>
          ) : null}
          {[...byDay.entries()].map(([day, list]) => (
            <Panel key={day} title={`${day === today ? "Today · " : ""}${dayLabel(day)}`}>
              <ul className="grid gap-3">
                {list.map((b) => {
                  const live = b.status === "booked";
                  const tone = live
                    ? "ok"
                    : b.status === "completed"
                      ? "ok"
                      : b.status === "no_show"
                        ? "bad"
                        : "mute";
                  return (
                    <li
                      key={b.id}
                      className={`rounded-xl border border-line p-3 ${live ? "" : "opacity-75"}`}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <b className="text-lg tabular-nums text-brand">
                          {timeLabel(b.starts_at, TZ)}
                        </b>
                        {b.contact_id ? (
                          <Link
                            href={`/admin/leads/${b.contact_id}`}
                            className="font-bold text-brand underline"
                          >
                            {contactName(b)}
                          </Link>
                        ) : (
                          <b>{contactName(b)}</b>
                        )}
                        <Status tone={tone}>
                          {
                            {
                              booked: "Booked",
                              completed: "Done",
                              no_show: "No-show",
                              cancelled: "Cancelled",
                            }[b.status]
                          }
                        </Status>
                        {b.source === "staff" ? (
                          <span className="text-xs text-muted">added by the team</span>
                        ) : null}
                      </div>
                      {b.goal ? <p className="mt-1 text-sm">Goal: {b.goal}</p> : null}
                      {b.notes ? (
                        <p className="mt-1 text-sm text-muted">Note: {b.notes}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {b.phone ? (
                          <>
                            <a
                              href={`tel:${b.phone}`}
                              className="inline-flex min-h-10 items-center rounded-button bg-brand px-3 text-xs font-bold text-on-brand"
                            >
                              Call {b.phone}
                            </a>
                            <a
                              href={`https://wa.me/${digits(b.phone)}`}
                              target="_blank"
                              rel="noopener"
                              className="inline-flex min-h-10 items-center rounded-button border-2 border-line px-3 text-xs font-bold text-brand"
                            >
                              WhatsApp
                            </a>
                          </>
                        ) : null}
                        {live ? (
                          <>
                            <form action={setBookingStatus.bind(null, b.id, "completed")}>
                              <ABtn>Done</ABtn>
                            </form>
                            <form action={setBookingStatus.bind(null, b.id, "no_show")}>
                              <ABtn>No-show</ABtn>
                            </form>
                          </>
                        ) : b.status !== "cancelled" ? (
                          <form action={setBookingStatus.bind(null, b.id, "booked")}>
                            <ABtn>Undo</ABtn>
                          </form>
                        ) : null}
                      </div>
                      {live ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <details className="rounded-lg bg-page p-2">
                            <summary className="cursor-pointer text-xs font-bold text-brand">
                              Move to another time
                            </summary>
                            <form
                              action={staffMove.bind(null, b.id)}
                              className="mt-2 flex flex-wrap items-end gap-2"
                            >
                              <label className="text-xs font-bold text-brand">
                                Day
                                <input
                                  type="date"
                                  name="day"
                                  required
                                  min={today}
                                  defaultValue={day}
                                  className={field}
                                />
                              </label>
                              <label className="text-xs font-bold text-brand">
                                Time
                                <input
                                  type="time"
                                  name="time"
                                  required
                                  step={300}
                                  defaultValue={new Date(b.starts_at).toLocaleTimeString(
                                    "en-GB",
                                    { timeZone: TZ, hour: "2-digit", minute: "2-digit" },
                                  )}
                                  className={field}
                                />
                              </label>
                              <ABtn variant="primary">Move</ABtn>
                            </form>
                            <p className="mt-1 text-[11px] text-muted">
                              They get an email with the new time.
                            </p>
                          </details>
                          <details className="rounded-lg bg-page p-2">
                            <summary className="cursor-pointer text-xs font-bold text-danger">
                              Cancel
                            </summary>
                            <form
                              action={staffCancel.bind(null, b.id)}
                              className="mt-2 grid gap-2"
                            >
                              <label className="flex items-center gap-2 text-xs">
                                <input type="checkbox" name="tell" defaultChecked /> Email
                                them that it is cancelled
                              </label>
                              <ABtn variant="danger">Cancel this consultation</ABtn>
                            </form>
                          </details>
                          <form action={resendConfirmation.bind(null, b.id)}>
                            <button className="text-xs text-muted underline">
                              Resend the confirmation email
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ))}

          <Panel
            title={
              prefill ? `Book a consult for ${contactName(prefill)}` : "Add a booking"
            }
            className="scroll-mt-20"
          >
            <form id="book" action={staffBook} className="grid gap-3 sm:grid-cols-2">
              {prefill ? (
                <input type="hidden" name="contact_id" value={prefill.id} />
              ) : null}
              <label className="text-xs font-bold text-brand">
                Day
                <input
                  type="date"
                  name="day"
                  required
                  min={today}
                  defaultValue={st.days[0]?.day ?? today}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                Time
                <input
                  type="time"
                  name="time"
                  required
                  step={300}
                  defaultValue={
                    st.days[0]?.slots[0]
                      ? new Date(st.days[0].slots[0].start).toLocaleTimeString("en-GB", {
                          timeZone: TZ,
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "18:00"
                  }
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                First name
                <input
                  name="first_name"
                  defaultValue={prefill?.first_name ?? ""}
                  required={!prefill}
                  maxLength={80}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                Last name
                <input
                  name="last_name"
                  defaultValue={prefill?.last_name ?? ""}
                  maxLength={80}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                Email
                <input
                  type="email"
                  name="email"
                  defaultValue={prefill?.email ?? ""}
                  required={!prefill?.email}
                  maxLength={200}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                Phone
                <input
                  type="tel"
                  name="phone"
                  defaultValue={prefill?.phone ?? ""}
                  maxLength={40}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand sm:col-span-2">
                Goal (optional)
                <input
                  name="goal"
                  defaultValue={prefill?.goal ?? ""}
                  maxLength={1000}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand sm:col-span-2">
                Private note (optional, only the team sees it)
                <input name="notes" maxLength={2000} className={field} />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="email_her" defaultChecked /> Email them the
                confirmation (with a link to change or cancel)
              </label>
              <p className="text-xs text-muted sm:col-span-2">
                You can book any time, even outside your opening hours. Only times already
                booked are refused.
              </p>
              <div>
                <ABtn variant="primary">Book it</ABtn>
              </div>
            </form>
          </Panel>
        </>
      ) : (
        <>
          <Panel title="Online booking">
            <form action={saveBookingSettings} className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm font-bold text-brand sm:col-span-2">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={st.row.enabled}
                  className="h-5 w-5"
                />
                Take bookings on the website (chardikalafitness.com/consult)
              </label>
              <p className="-mt-2 text-xs text-muted sm:col-span-2">
                While this is off, the website keeps showing the old booking calendar.
              </p>
              <label className="text-xs font-bold text-brand">
                Length of a consultation (minutes)
                <input
                  type="number"
                  name="slot_minutes"
                  min={5}
                  max={240}
                  step={5}
                  defaultValue={st.row.slot_minutes}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                Free minutes after each consultation
                <input
                  type="number"
                  name="buffer_minutes"
                  min={0}
                  max={120}
                  step={5}
                  defaultValue={st.row.buffer_minutes}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                Book at least this many hours ahead
                <input
                  type="number"
                  name="notice_hours"
                  min={0}
                  max={168}
                  defaultValue={Math.round(st.row.min_notice_minutes / 60)}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                Show this many days ahead
                <input
                  type="number"
                  name="max_days_ahead"
                  min={1}
                  max={120}
                  defaultValue={st.row.max_days_ahead}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                Name of the call
                <input
                  name="title"
                  maxLength={120}
                  defaultValue={st.row.title}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand">
                How you meet
                <input
                  name="location"
                  maxLength={200}
                  defaultValue={st.row.location}
                  className={field}
                />
              </label>
              <label className="text-xs font-bold text-brand sm:col-span-2">
                Email these people about each new booking (up to 5, separated by commas)
                <input
                  name="notify_emails"
                  maxLength={500}
                  defaultValue={st.row.notify_emails}
                  placeholder="chanveer@gmail.com, kv@gmail.com"
                  className={field}
                />
              </label>
              <div>
                <ABtn variant="primary">Save settings</ABtn>
              </div>
            </form>
          </Panel>

          <Panel title="Weekly opening hours">
            {WEEKDAYS.map((name, wd) => {
              const list = windows.filter((w) => w.weekday === wd);
              return (
                <div
                  key={name}
                  className="flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-0"
                >
                  <b className="w-24 text-sm text-brand">{name}</b>
                  {list.length ? (
                    list.map((w) => (
                      <form key={w.id} action={removeWindow.bind(null, w.id)}>
                        <button
                          className="inline-flex min-h-8 items-center gap-1 rounded-full bg-page px-3 text-xs font-bold text-brand"
                          aria-label={`Remove ${name} ${t12(w.start_time)} to ${t12(w.end_time)}`}
                        >
                          {t12(w.start_time)} – {t12(w.end_time)}{" "}
                          <span aria-hidden="true">×</span>
                        </button>
                      </form>
                    ))
                  ) : (
                    <span className="text-xs text-muted">Closed</span>
                  )}
                </div>
              );
            })}
            <form action={addWindow} className="mt-4 grid gap-3">
              <fieldset>
                <legend className="text-xs font-bold text-brand">Add hours on</legend>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((name, wd) => (
                    <label
                      key={name}
                      className="inline-flex cursor-pointer items-center rounded-full border-2 border-line px-3 py-1 text-xs font-bold text-brand has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-on-brand"
                    >
                      <input
                        type="checkbox"
                        name="weekday"
                        value={wd}
                        className="sr-only"
                      />
                      {name.slice(0, 3)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs font-bold text-brand">
                  From
                  <input
                    type="time"
                    name="start"
                    required
                    step={300}
                    defaultValue="18:00"
                    className={field}
                  />
                </label>
                <label className="text-xs font-bold text-brand">
                  To
                  <input
                    type="time"
                    name="end"
                    required
                    step={300}
                    defaultValue="20:00"
                    className={field}
                  />
                </label>
                <ABtn variant="primary">Add hours</ABtn>
              </div>
              <p className="text-xs text-muted">
                Add several blocks for one day (for example 9–11 am and 6–8 pm).
              </p>
            </form>
          </Panel>

          <Panel title="Days off and busy times">
            <ul className="grid gap-1.5">
              {st.blocks.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    {new Date(b.starts_at).toLocaleString("en-CA", {
                      timeZone: TZ,
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {" → "}
                    {new Date(b.ends_at).toLocaleString("en-CA", {
                      timeZone: TZ,
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {b.reason ? ` · ${b.reason}` : ""}
                  </span>
                  <form action={removeBlock.bind(null, b.id)}>
                    <button className="text-xs text-danger underline">Remove</button>
                  </form>
                </li>
              ))}
              {!st.blocks.length ? <li className="text-xs text-muted">None.</li> : null}
            </ul>
            <form action={addBlock} className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-bold text-brand">
                First day
                <input type="date" name="from" required min={today} className={field} />
              </label>
              <label className="text-xs font-bold text-brand">
                Last day (blank = same day)
                <input type="date" name="to" min={today} className={field} />
              </label>
              <label className="text-xs font-bold text-brand">
                From time (blank = whole day)
                <input type="time" name="from_time" step={300} className={field} />
              </label>
              <label className="text-xs font-bold text-brand">
                To time
                <input type="time" name="to_time" step={300} className={field} />
              </label>
              <label className="text-xs font-bold text-brand sm:col-span-2">
                Reason (only you see it)
                <input
                  name="reason"
                  maxLength={200}
                  placeholder="Holiday, family event…"
                  className={field}
                />
              </label>
              <div>
                <ABtn variant="primary">Block these times</ABtn>
              </div>
            </form>
          </Panel>

          <Panel title="See bookings in Google Calendar">
            {feedUrl ? (
              <>
                <p className="text-sm">
                  Subscribe once and every consultation shows in your own Google Calendar
                  (on the phone too). In Google Calendar on a computer:{" "}
                  <b>Other calendars → + → From URL</b>, paste this address, then{" "}
                  <b>Add calendar</b>.
                </p>
                <input
                  readOnly
                  value={feedUrl}
                  className={`${aInput} mt-2 font-mono text-xs`}
                  aria-label="Private calendar address"
                />
                <p className="mt-2 text-xs text-muted">
                  Keep this address private: anyone with it can see names and phone
                  numbers. Google refreshes it every few hours, so for a booking made just
                  now use the &quot;Add to Google Calendar&quot; link in the new-booking
                  email. Two-way sync (busy times in Google blocking the booking page) is
                  the next step.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted">Not available: CRON_SECRET is not set.</p>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
