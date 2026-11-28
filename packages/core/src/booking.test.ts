import { describe, expect, it } from "vitest";
import {
  availableSlots,
  bookingReminderDue,
  bookingIcs,
  cleanEmail,
  DEFAULT_BOOKING_SETTINGS,
  googleCalendarLink,
  isBookable,
  phoneLabel,
  stageAfterBooking,
  timeLabel,
  zonedTime,
} from "./booking";

const settings = { ...DEFAULT_BOOKING_SETTINGS, maxDaysAhead: 7, minNoticeMinutes: 120 };
// Monday evenings 7-8 pm Vancouver.
const availability = [{ weekday: 0, start: "19:00", end: "20:00" }];
// Monday 30 Nov 2026, 10:00 am Vancouver (18:00 UTC, winter time = UTC-8).
const now = new Date("2026-11-30T18:00:00Z");

describe("zonedTime", () => {
  it("handles winter and summer time in Vancouver", () => {
    expect(zonedTime("2026-12-01", "19:15", "America/Vancouver").toISOString()).toBe(
      "2026-12-02T03:15:00.000Z",
    );
    expect(zonedTime("2027-06-01", "19:15", "America/Vancouver").toISOString()).toBe(
      "2027-06-02T02:15:00.000Z",
    );
  });
  it("gets the day the clocks change right", () => {
    // 14 March 2027: clocks spring forward at 2 am; 10 am is already summer time (UTC-7).
    expect(zonedTime("2027-03-14", "10:00", "America/Vancouver").toISOString()).toBe(
      "2027-03-14T17:00:00.000Z",
    );
  });
  it("labels times in Vancouver time", () =>
    expect(timeLabel("2026-12-01T03:15:00Z")).toBe("7:15 PM"));
});

describe("availableSlots", () => {
  it("lists every 15-minute slot in the weekly hours, today and next week", () => {
    const days = availableSlots({ settings, availability, blocks: [], busy: [], now });
    expect(days.map((d) => d.day)).toEqual(["2026-11-30", "2026-12-07"]);
    expect(days[0]!.slots.map((s) => s.label)).toEqual([
      "7:00 PM",
      "7:15 PM",
      "7:30 PM",
      "7:45 PM",
    ]);
  });
  it("leaves out booked times, blocked days and anything too soon", () => {
    const busy = [{ starts_at: "2026-12-01T03:15:00Z", ends_at: "2026-12-01T03:30:00Z" }];
    const blocks = [
      { starts_at: "2026-12-07T08:00:00Z", ends_at: "2026-12-08T08:00:00Z" },
    ];
    const late = new Date("2026-12-01T02:00:00Z"); // 6 pm, so 7:00-7:45 is under 2 hours away
    const days = availableSlots({ settings, availability, blocks, busy, now: late });
    expect(days).toEqual([]);
    const days2 = availableSlots({ settings, availability, blocks, busy, now });
    expect(days2.map((d) => d.day)).toEqual(["2026-11-30"]);
    expect(days2[0]!.slots.map((s) => s.label)).toEqual([
      "7:00 PM",
      "7:30 PM",
      "7:45 PM",
    ]);
  });
  it("keeps a buffer after bookings when asked", () => {
    const busy = [{ starts_at: "2026-12-01T03:00:00Z", ends_at: "2026-12-01T03:15:00Z" }];
    const days = availableSlots({
      settings: { ...settings, bufferMinutes: 15 },
      availability,
      blocks: [],
      busy,
      now,
    });
    expect(days[0]!.slots.map((s) => s.label)).toEqual(["7:30 PM", "7:45 PM"]);
  });
  it("only accepts a start that is really free", () => {
    const input = { settings, availability, blocks: [], busy: [], now };
    expect(isBookable("2026-12-01T03:15:00.000Z", input)).toBe(true);
    expect(isBookable("2026-12-01T03:10:00.000Z", input)).toBe(false);
    expect(isBookable("2026-12-01T05:00:00.000Z", input)).toBe(false);
  });
});

describe("calendar links", () => {
  const b = {
    uid: "abc",
    start: "2026-12-01T03:15:00Z",
    end: "2026-12-01T03:30:00Z",
    title: "Free consultation, Chardikala Fitness",
  };
  it("makes a valid calendar file", () => {
    const ics = bookingIcs({ ...b, description: "Call, with notes; and more" });
    expect(ics).toContain("DTSTART:20261201T031500Z");
    expect(ics).toContain("UID:abc@chardikalafitness.com");
    expect(ics).toContain("Call\\, with notes\\; and more");
  });
  it("makes an add-to-Google-Calendar link", () =>
    expect(googleCalendarLink(b)).toContain("dates=20261201T031500Z%2F20261201T033000Z"));
});

describe("crm helpers", () => {
  it("cleans emails", () => {
    expect(cleanEmail("  Priya@Example.COM ")).toBe("priya@example.com");
    expect(cleanEmail("not-an-email")).toBeNull();
  });
  it("moves a contact to Consult booked, never backwards", () => {
    expect(stageAfterBooking("new")).toBe("consult_booked");
    expect(stageAfterBooking(null)).toBe("consult_booked");
    expect(stageAfterBooking("client")).toBe("client");
    expect(stageAfterBooking("lost")).toBe("consult_booked");
  });
});

describe("bookingReminderDue", () => {
  const b = {
    starts_at: "2026-12-10T03:00:00Z",
    created_at: "2026-12-01T00:00:00Z",
    reminder_day_at: null,
    reminder_hour_at: null,
  };
  it("sends the day-before reminder once, then the one-hour reminder", () => {
    expect(bookingReminderDue(b, new Date("2026-12-08T03:00:00Z"))).toBeNull();
    expect(bookingReminderDue(b, new Date("2026-12-09T05:00:00Z"))).toBe("day");
    const sent = { ...b, reminder_day_at: "2026-12-09T05:00:00Z" };
    expect(bookingReminderDue(sent, new Date("2026-12-09T06:00:00Z"))).toBeNull();
    expect(bookingReminderDue(sent, new Date("2026-12-10T02:00:00Z"))).toBe("hour");
    expect(bookingReminderDue(sent, new Date("2026-12-10T03:05:00Z"))).toBeNull();
  });
  it("skips reminders for last-minute bookings", () => {
    const late = { ...b, created_at: "2026-12-09T20:00:00Z" };
    expect(bookingReminderDue(late, new Date("2026-12-09T21:00:00Z"))).toBeNull();
    expect(bookingReminderDue(late, new Date("2026-12-10T02:00:00Z"))).toBe("hour");
  });
});

describe("phoneLabel", () => {
  it("formats North American numbers and leaves others", () => {
    expect(phoneLabel("+16729622219")).toBe("+1 672-962-2219");
    expect(phoneLabel("+447700900123")).toBe("+447700900123");
  });
});
