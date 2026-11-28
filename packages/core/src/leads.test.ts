import { describe, expect, it } from "vitest";
import {
  cleanSteps,
  impliedUntil,
  leadEmailable,
  nextStepAt,
  parseLeads,
  splitTags,
} from "./leads";

describe("parseLeads", () => {
  it("reads a Go High Level export with tags, phone-only people and do-not-disturb", () => {
    const p = parseLeads([
      [
        "Contact Id",
        "First Name",
        "Last Name",
        "Phone",
        "Email",
        "Created",
        "Tags",
        "Source",
        "DND",
      ],
      [
        "a1",
        "Priya",
        "Sandhu",
        "(604) 555-0101",
        "Priya@Example.com",
        "2025-03-01",
        "winter, Instagram lead",
        "facebook ad",
        "false",
      ],
      ["a2", "Aman", "", "604 555 0102", "", "", "walk-in", "", ""],
      ["a3", "", "", "", "bad-email", "", "", "", ""],
      ["a4", "Dup", "", "", "priya@example.com", "", "", "", ""],
      ["a5", "Rita", "K", "", "rita@example.com", "", "", "", "true"],
    ]);
    expect(p.rows).toHaveLength(3);
    expect(p.rows[0]).toMatchObject({
      first: "Priya",
      email: "priya@example.com",
      phone: "+16045550101",
      tags: ["winter", "Instagram lead"],
      source: "facebook ad",
      externalId: "a1",
      dnd: false,
    });
    expect(p.rows[0]!.created).toMatch(/^2025-03-01/);
    expect(p.rows[1]).toMatchObject({
      email: null,
      phone: "+16045550102",
      tags: ["walk-in"],
    });
    expect(p.rows[2]!.dnd).toBe(true);
    expect(p.invalid).toHaveLength(1);
    expect(p.duplicates).toBe(1);
    expect(p.fileTags).toEqual(["Instagram lead", "walk-in", "winter"]);
  });
  it("needs an email or phone column", () =>
    expect(parseLeads([["Name"], ["A"]]).missingColumns).toBe(true));
  it("splits tags without repeats", () =>
    expect(splitTags("a; A, b | c ")).toEqual(["a", "b", "c"]));
});

describe("leadEmailable (CASL)", () => {
  const now = new Date("2026-12-01T00:00:00Z");
  const base = {
    email: "a@b.co",
    email_consent_at: null,
    implied_consent_until: null,
    unsubscribed_at: null,
  };
  it("needs permission", () => {
    expect(leadEmailable(base, now)).toBe(false);
    expect(leadEmailable({ ...base, email_consent_at: "2020-01-01" }, now)).toBe(true);
    expect(leadEmailable({ ...base, implied_consent_until: "2027-01-01" }, now)).toBe(
      true,
    );
    expect(leadEmailable({ ...base, implied_consent_until: "2026-11-01" }, now)).toBe(
      false,
    );
  });
  it("never after unsubscribing or without an email", () => {
    expect(
      leadEmailable(
        { ...base, email_consent_at: "2020-01-01", unsubscribed_at: "2026-01-01" },
        now,
      ),
    ).toBe(false);
    expect(
      leadEmailable({ ...base, email: null, email_consent_at: "2020-01-01" }, now),
    ).toBe(false);
  });
  it("implied consent lasts 2 years for customers, 6 months for enquiries", () => {
    expect(impliedUntil("2026-01-01T00:00:00Z", "customer").slice(0, 10)).toBe(
      "2028-01-01",
    );
    expect(impliedUntil("2026-01-01T00:00:00Z", "enquiry").slice(0, 10)).toBe(
      "2026-07-02",
    );
  });
});

describe("automations", () => {
  it("times each step from the previous one", () => {
    const steps = [{ delay_days: 0 }, { delay_days: 3 }];
    expect(nextStepAt(steps, 0, "2026-12-01T10:00:00Z")).toBe("2026-12-01T10:00:00.000Z");
    expect(nextStepAt(steps, 1, "2026-12-01T10:00:00Z")).toBe("2026-12-04T10:00:00.000Z");
    expect(nextStepAt(steps, 2, "2026-12-01T10:00:00Z")).toBeNull();
  });
  it("drops empty steps and caps the delay", () => {
    const s = cleanSteps([
      { delay_days: 900, subject: "Hi", body: "x" },
      { subject: "", body: "y" },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]!.delay_days).toBe(365);
  });
});
