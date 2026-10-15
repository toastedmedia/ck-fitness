import { describe, expect, it } from "vitest";
import {
  campaignBlocks,
  renderCampaign,
  safeCtaUrl,
  CAMPAIGN_PRESETS,
} from "./campaigns";

const site = "https://app.chardikalafitness.com";
const base = {
  subject: "Hi {{name}}",
  preheader: "p",
  heading: "H {{name}}",
  body: "One\n\nTwo",
  ctaLabel: "Go",
  ctaUrl: "/home",
};

describe("campaignBlocks", () => {
  it("splits paragraphs and bullet lists", () => {
    expect(campaignBlocks("A\nline\n\n- x\n- y\n\nB")).toEqual([
      { type: "p", text: "A line" },
      { type: "ul", items: ["x", "y"] },
      { type: "p", text: "B" },
    ]);
  });
});

describe("safeCtaUrl", () => {
  it("allows https and in-app paths only", () => {
    expect(safeCtaUrl("/home", site)).toBe(`${site}/home`);
    expect(safeCtaUrl("https://example.com/x", site)).toBe("https://example.com/x");
    expect(safeCtaUrl("javascript:alert(1)", site)).toBeNull();
    expect(safeCtaUrl("//evil.com", site)).toBeNull();
    expect(safeCtaUrl("http://plain.com", site)).toBeNull();
  });
});

describe("renderCampaign", () => {
  it("personalises, escapes, and adds an unsubscribe link and the address", () => {
    const e = renderCampaign(
      { ...base, body: "Hi <b>{{name}}</b>" },
      { name: "Priya" },
      { siteUrl: site, unsubscribeUrl: "https://x/u" },
    );
    expect(e.subject).toBe("Hi Priya");
    expect(e.html).toContain("Hi &lt;b&gt;Priya&lt;/b&gt;");
    expect(e.html).toContain("Unsubscribe");
    expect(e.html).toContain("Surrey, British Columbia");
    expect(e.html).toContain(`${site}/home`);
  });
  it("leaves out the button when the link is not safe", () => {
    const e = renderCampaign({ ...base, ctaUrl: "javascript:x" }, {}, { siteUrl: site });
    expect(e.html).not.toContain("javascript:");
    expect(e.html).not.toContain(">Go<");
  });
  it("every preset renders", () => {
    for (const p of CAMPAIGN_PRESETS)
      expect(
        renderCampaign({ ...p, imageUrl: null }, { name: "A" }, { siteUrl: site }).html
          .length,
      ).toBeGreaterThan(200);
  });
});
