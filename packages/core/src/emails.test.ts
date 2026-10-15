import { describe, expect, it } from "vitest";
import { ALWAYS_SENT, EMAIL_LABELS, renderEmail, type EmailKey } from "./emails";

const keys = Object.keys(EMAIL_LABELS) as EmailKey[];
const opts = { siteUrl: "https://app.chardikalafitness.com/" };

describe("renderEmail", () => {
  it("renders every email with a subject, html, text and the brand footer", () => {
    for (const k of keys) {
      const e = renderEmail(k, { name: "Priya" }, opts);
      expect(e.subject.length).toBeGreaterThan(5);
      expect(e.html).toContain("Chardikala Fitness");
      expect(e.text).toContain("Surrey, British Columbia");
    }
  });
  it("greets by name and links to the right page", () => {
    const e = renderEmail("checkin_reminder", { name: "Priya" }, opts);
    expect(e.html).toContain("Priya");
    expect(e.html).toContain("https://app.chardikalafitness.com/accountability/checkin");
    expect(renderEmail("welcome", { name: "Priya" }, opts).subject).toContain("Priya");
  });
  it("escapes anything a member typed so it cannot inject markup", () => {
    const e = renderEmail("welcome", { name: '<img src=x onerror="a">' }, opts);
    expect(e.html).not.toContain("<img src=x");
    expect(e.html).toContain("&lt;img");
  });
  it("falls back to a friendly word when there is no name", () => {
    expect(renderEmail("we_miss_you", {}, opts).subject).toContain("there");
  });
  it("shows the unsubscribe link only when asked, and never for always-sent emails' copy", () => {
    const withLink = renderEmail(
      "we_miss_you",
      { name: "P" },
      { ...opts, unsubscribeUrl: "https://x/u?t=1" },
    );
    expect(withLink.html).toContain("Turn these emails off");
    expect(renderEmail("we_miss_you", { name: "P" }, opts).html).not.toContain(
      "Turn these emails off",
    );
    expect(ALWAYS_SENT).toContain("payment_problem");
    expect(ALWAYS_SENT).not.toContain("checkin_reminder");
  });
  it("keeps health details out of the support reply email", () => {
    const e = renderEmail("support_replied", { name: "P" }, opts);
    expect(e.text.toLowerCase()).toContain("open the app");
  });
});
