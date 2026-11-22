import { describe, expect, it } from "vitest";
import {
  DEFAULT_WELCOME_SMS,
  SMS_STOP_LINE,
  countryAllowed,
  maskPhone,
  parseCountryCodes,
  renderSms,
  smsSegments,
  toE164,
  validateSmsSettings,
  type SmsSettingsInput,
} from "./sms";

describe("phone numbers", () => {
  it("reads the ways members type Canadian and US numbers", () => {
    expect(toE164("778-555 0123")).toBe("+17785550123");
    expect(toE164("(604) 555-0123")).toBe("+16045550123");
    expect(toE164("16045550123")).toBe("+16045550123");
    expect(toE164("+1 604 555 0123")).toBe("+16045550123");
    expect(toE164("604.555.0123")).toBe("+16045550123");
  });

  it("keeps numbers that already have a country code", () => {
    expect(toE164("+44 7400 123456")).toBe("+447400123456");
    expect(toE164("0044 7400 123456")).toBe("+447400123456");
    expect(toE164("+916239207578")).toBe("+916239207578");
  });

  it("refuses numbers it would have to guess", () => {
    expect(toE164("07407399413")).toBeNull(); // UK number without +44
    expect(toE164("0431724133")).toBeNull(); // Australian number without +61
    expect(toE164("587396351")).toBeNull(); // a digit missing
    expect(toE164("1234567890")).toBeNull(); // not a real North American number
    expect(toE164("call me")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
  });

  it("only texts the countries the owners allow", () => {
    expect(parseCountryCodes("1, 44 ;91")).toEqual(["1", "44", "91"]);
    expect(parseCountryCodes("+1, 1, abc")).toEqual(["1"]);
    expect(parseCountryCodes(["1"])).toEqual(["1"]);
    expect(countryAllowed("+16045550123", ["1"])).toBe(true);
    expect(countryAllowed("+447400123456", ["1"])).toBe(false);
    expect(countryAllowed("+447400123456", ["1", "44"])).toBe(true);
  });

  it("stores only a masked number", () => {
    expect(maskPhone("+16045550123")).toBe("+1 ••• ••• 0123");
    expect(maskPhone("+447400123456")).toBe("+447 ••• ••• 3456");
  });
});

describe("message text", () => {
  it("fills in the first name and adds the opt-out line", () => {
    const t = renderSms(DEFAULT_WELCOME_SMS, { firstName: "Priya Kaur" });
    expect(t.startsWith("Hi Priya, welcome to Chardikala Fitness!")).toBe(true);
    expect(t.endsWith(SMS_STOP_LINE)).toBe(true);
  });

  it("works without a name and keeps an opt-out line the owners wrote", () => {
    expect(renderSms("Hi {{ name }}!", {})).toBe(`Hi there! ${SMS_STOP_LINE}`);
    expect(renderSms("Hi {{first_name}}. Text STOP to stop.", { firstName: "Ann" })).toBe(
      "Hi Ann. Text STOP to stop.",
    );
  });

  it("counts texts like the carriers do", () => {
    expect(smsSegments("a".repeat(160))).toEqual({ segments: 1, unicode: false });
    expect(smsSegments("a".repeat(161))).toEqual({ segments: 2, unicode: false });
    expect(smsSegments("Hi 💪")).toEqual({ segments: 1, unicode: true });
    expect(smsSegments(`${"a".repeat(70)}💪`).segments).toBe(2);
    // The default welcome fits in one text, opt-out line included.
    expect(
      smsSegments(renderSms(DEFAULT_WELCOME_SMS, { firstName: "Priya" })).segments,
    ).toBe(1);
  });
});

describe("Admin settings form", () => {
  const SID = `AC${"a".repeat(32)}`;
  const base: SmsSettingsInput = {
    accountSid: SID,
    authToken: "b".repeat(32),
    hasSavedToken: false,
    fromNumber: "+1 604 555 0123",
    messagingServiceSid: "",
    welcomeBody: DEFAULT_WELCOME_SMS,
    countryCodes: "1",
    dailyLimit: "100",
    enabled: true,
  };

  it("accepts a complete setup", () => {
    const r = validateSmsSettings(base);
    expect(r.ok && r.value).toMatchObject({
      accountSid: SID,
      fromNumber: "+16045550123",
      countryCodes: ["1"],
      dailyLimit: 100,
      enabled: true,
    });
  });

  it("keeps the saved token when the box is left empty", () => {
    const r = validateSmsSettings({ ...base, authToken: "", hasSavedToken: true });
    expect(r.ok && r.value.authToken).toBeNull();
    expect(r.ok).toBe(true);
  });

  it("refuses to switch on without keys, but saves a draft", () => {
    const off = { ...base, authToken: "", hasSavedToken: false };
    expect(validateSmsSettings(off).ok).toBe(false);
    expect(validateSmsSettings({ ...off, enabled: false }).ok).toBe(true);
    expect(
      validateSmsSettings({ ...base, fromNumber: "", messagingServiceSid: "" }).ok,
    ).toBe(false);
    expect(
      validateSmsSettings({
        ...base,
        fromNumber: "",
        messagingServiceSid: `MG${"c".repeat(32)}`,
      }).ok,
    ).toBe(true);
  });

  it("explains each mistake in plain words", () => {
    const err = (p: Partial<SmsSettingsInput>) => {
      const r = validateSmsSettings({ ...base, ...p });
      return r.ok ? "" : r.error;
    };
    expect(err({ accountSid: "SK123" })).toMatch(/starts with AC/);
    expect(err({ authToken: "short" })).toMatch(/32 letters/);
    expect(err({ fromNumber: "555" })).toMatch(/country code/);
    expect(err({ messagingServiceSid: "XX" })).toMatch(/starts with MG/);
    expect(err({ welcomeBody: " " })).toMatch(/welcome message/);
    expect(err({ welcomeBody: "a".repeat(481) })).toMatch(/under 480/);
    expect(err({ countryCodes: "abc" })).toMatch(/country code/);
    expect(err({ dailyLimit: "0" })).toMatch(/between 1 and 5000/);
  });
});
