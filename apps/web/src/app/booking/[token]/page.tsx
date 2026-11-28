import type { Metadata } from "next";
import { dayLabel, googleCalendarLink } from "@ck/core";
import { SiteFooter } from "@/components/SiteFooter";
import { freeSlots, whenText, type BookingRow } from "@/lib/bookings";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { cancelMyBooking, moveMyBooking } from "./actions";

export const metadata: Metadata = {
  title: "Your consultation",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

const btn =
  "inline-flex min-h-12 items-center justify-center rounded-button px-5 text-sm font-bold";

export default async function ManageBooking({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const db = createAdminSupabase();
  const { data } = /^[\w-]{20,40}$/.test(token)
    ? await db.from("bookings").select("*").eq("manage_token", token).maybeSingle()
    : { data: null };
  const b = data as BookingRow | null;
  const upcoming =
    b && b.status === "booked" && new Date(b.ends_at).getTime() > Date.now();
  const st = upcoming ? await freeSlots(db) : null;
  return (
    <>
      <main id="main" className="mx-auto max-w-xl px-4 pt-10">
        <p className="text-xs font-bold uppercase tracking-wider text-accent-strong">
          Chardikala Fitness &amp; Performance
        </p>
        <h1 className="mt-1 font-display text-3xl text-brand">Your consultation</h1>
        {!b ? (
          <p className="mt-4 text-muted">
            We could not find this booking. The link may be incomplete. Book a new time at{" "}
            <a
              className="font-bold text-brand underline"
              href="https://chardikalafitness.com/consult"
            >
              chardikalafitness.com/consult
            </a>
            .
          </p>
        ) : (
          <>
            {sp.done ? (
              <p
                role="status"
                className="mt-4 rounded-card bg-success-soft p-3 text-sm font-semibold text-success"
              >
                {sp.done === "cancelled"
                  ? "Your consultation is cancelled. We've emailed you a confirmation."
                  : "Done. Your new time is confirmed and we've emailed you."}
              </p>
            ) : null}
            {sp.error ? (
              <p
                role="alert"
                className="mt-4 rounded-card bg-[#f6dcd7] p-3 text-sm font-semibold text-danger"
              >
                {sp.error === "taken"
                  ? "Sorry, that time was just taken. Please pick another."
                  : "That did not work. Please try again or message us on WhatsApp."}
              </p>
            ) : null}
            <section className="mt-5 rounded-card border border-line bg-surface p-5">
              <p className="text-sm text-muted">
                {b.status === "cancelled"
                  ? "Cancelled"
                  : b.status === "booked"
                    ? upcoming
                      ? "Booked"
                      : "This consultation has passed"
                    : "Done"}
              </p>
              <p className="mt-1 text-xl font-bold text-brand">{whenText(b.starts_at)}</p>
              <p className="mt-2 text-sm">
                {b.phone
                  ? `Coach Chanveer will call you at ${b.phone}.`
                  : st?.row.location}
              </p>
              {upcoming ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    className={`${btn} bg-brand text-on-brand`}
                    href={googleCalendarLink({
                      start: b.starts_at,
                      end: b.ends_at,
                      title: "Free consultation, Chardikala Fitness",
                      details: "Coach Chanveer will call you.",
                    })}
                    target="_blank"
                    rel="noopener"
                  >
                    Add to Google Calendar
                  </a>
                  <a
                    className={`${btn} border-2 border-line text-brand`}
                    href={`/api/booking/ics/${token}`}
                  >
                    Add to Apple / Outlook
                  </a>
                </div>
              ) : null}
            </section>
            {upcoming && st ? (
              <>
                <section className="mt-5 rounded-card border border-line bg-surface p-5">
                  <h2 className="font-bold text-brand">Change the time</h2>
                  {st.days.length ? (
                    <form
                      action={moveMyBooking.bind(null, token)}
                      className="mt-3 grid gap-3"
                    >
                      <label className="text-sm font-semibold text-brand">
                        New time (Pacific time)
                        <select
                          name="start"
                          required
                          className="mt-1 min-h-12 w-full rounded-xl border-2 border-line bg-surface px-3 text-base font-normal"
                        >
                          {st.days.map((d) => (
                            <optgroup key={d.day} label={dayLabel(d.day)}>
                              {d.slots.map((s) => (
                                <option key={s.start} value={s.start}>
                                  {dayLabel(d.day)}, {s.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      <button className={`${btn} bg-brand text-on-brand`}>
                        Move my consultation
                      </button>
                    </form>
                  ) : (
                    <p className="mt-2 text-sm text-muted">
                      No other times are open right now. Message us on WhatsApp and
                      we&apos;ll find one.
                    </p>
                  )}
                </section>
                <section className="mt-5 rounded-card border border-line bg-surface p-5">
                  <h2 className="font-bold text-brand">Can&apos;t make it?</h2>
                  <form action={cancelMyBooking.bind(null, token)} className="mt-3">
                    <button className={`${btn} border-2 border-danger text-danger`}>
                      Cancel my consultation
                    </button>
                  </form>
                </section>
              </>
            ) : null}
            <p className="mt-6 text-sm text-muted">
              Questions?{" "}
              <a
                className="font-bold text-brand underline"
                href="https://wa.me/16729622219"
                target="_blank"
                rel="noopener"
              >
                Message us on WhatsApp
              </a>
              .
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
