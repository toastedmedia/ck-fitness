/**
 * Text messages (SMS). Pure rules shared by the app and tests: phone numbers to the international
 * format Twilio needs, which countries may be texted, the welcome message text and how many texts
 * (segments) a message costs.
 */

export const SMS_MAX_LENGTH = 480;
export const SMS_STOP_LINE = "Reply STOP to opt out.";
export const DEFAULT_WELCOME_SMS =
  "Hi {{first_name}}, welcome to Chardikala Fitness! Your account is ready. Open your trainings any time at app.chardikalafitness.com";

/**
 * A phone number as typed by a member ("778-555 0123", "(604) 555-0123", "+44 7400 123456",
 * "0044...") in E.164 ("+17785550123"). A 10-digit number is read as Canada/US (+1) because that is
 * where the studio is. Anything else without a country code is refused (null): guessing would text
 * the wrong person.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!/^[+\d\s().\-]+$/.test(t)) return null;
  const digits = t.replace(/\D/g, "");
  let out: string | null = null;
  if (t.startsWith("+")) out = `+${digits}`;
  else if (digits.startsWith("00")) out = `+${digits.slice(2)}`;
  else if (digits.length === 10 && /^[2-9]\d{2}[2-9]/.test(digits)) out = `+1${digits}`;
  else if (digits.length === 11 && /^1[2-9]\d{2}[2-9]/.test(digits)) out = `+${digits}`;
  return out && /^\+[1-9]\d{7,14}$/.test(out) ? out : null;
}

/** Country calling codes typed by the owners ("1, 44") as a clean list. */
export function parseCountryCodes(
  raw: string | readonly string[] | null | undefined,
): string[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(/[\s,;]+/);
  const out = list
    .map((c) => String(c).replace(/\D/g, ""))
    .filter((c) => /^[1-9]\d{0,2}$/.test(c));
  return [...new Set(out)].slice(0, 20);
}

/**
 * May this number be texted? Only the countries the owners allow (Canada/US by default), which
 * stops "SMS pumping": bots signing up with premium-rate foreign numbers to run up the bill.
 */
export function countryAllowed(e164: string, codes: readonly string[]): boolean {
  return codes.some((c) => e164.startsWith(`+${c}`));
}

/** "+17785550123" -> "+1 ••• ••• 0123". Only this is stored in the log. */
export function maskPhone(e164: string): string {
  const last = e164.slice(-4);
  const cc = e164.startsWith("+1") ? "+1" : e164.slice(0, Math.min(4, e164.length - 4));
  return `${cc} ••• ••• ${last}`;
}

/** Fills {{first_name}} (or {{name}}), tidies spaces and adds the opt-out line if it is missing. */
export function renderSms(template: string, vars: { firstName?: string | null }): string {
  const name = (vars.firstName ?? "").trim().split(/\s+/)[0] || "there";
  let body = template
    .replace(/\{\{\s*(first_name|name)\s*\}\}/gi, name)
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!/\bSTOP\b/.test(body)) body = `${body} ${SMS_STOP_LINE}`;
  return body.slice(0, SMS_MAX_LENGTH);
}

const GSM =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";

/**
 * How many texts the carrier counts (each is billed). Plain characters: 160 in one text, 153 per
 * part after that. Any emoji or special character switches to 70 / 67.
 */
export function smsSegments(body: string): { segments: number; unicode: boolean } {
  const chars = [...body];
  const unicode = chars.some((c) => !GSM.includes(c) && !GSM_EXT.includes(c));
  if (unicode) {
    const n = chars.length;
    return { segments: n <= 70 ? 1 : Math.ceil(n / 67), unicode };
  }
  const n = chars.reduce((a, c) => a + (GSM_EXT.includes(c) ? 2 : 1), 0);
  return { segments: n <= 160 ? 1 : Math.ceil(n / 153), unicode };
}

export type SmsSettingsInput = {
  accountSid: string;
  authToken: string; // empty = keep the saved one
  hasSavedToken: boolean;
  fromNumber: string;
  messagingServiceSid: string;
  welcomeBody: string;
  countryCodes: string;
  dailyLimit: string;
  enabled: boolean;
};

export type SmsSettingsClean = {
  accountSid: string | null;
  authToken: string | null; // null = keep
  fromNumber: string | null;
  messagingServiceSid: string | null;
  welcomeBody: string;
  countryCodes: string[];
  dailyLimit: number;
  enabled: boolean;
};

/** Checks the Admin form. Switching on needs a complete setup; saving a draft does not. */
export function validateSmsSettings(
  i: SmsSettingsInput,
): { ok: true; value: SmsSettingsClean } | { ok: false; error: string } {
  const sid = i.accountSid.trim();
  if (sid && !/^AC[0-9a-fA-F]{32}$/.test(sid))
    return {
      ok: false,
      error: "The Account SID starts with AC and has 34 characters. Copy it from Twilio.",
    };
  const token = i.authToken.trim();
  if (token && !/^[0-9a-zA-Z]{32}$/.test(token))
    return {
      ok: false,
      error: "The Auth Token has 32 letters and numbers. Copy it from Twilio.",
    };
  const from = i.fromNumber.trim() ? toE164(i.fromNumber) : null;
  if (i.fromNumber.trim() && !from)
    return {
      ok: false,
      error:
        "Write the Twilio phone number with its country code, for example +16045550123.",
    };
  const mg = i.messagingServiceSid.trim();
  if (mg && !/^MG[0-9a-fA-F]{32}$/.test(mg))
    return {
      ok: false,
      error: "The Messaging Service SID starts with MG and has 34 characters.",
    };
  const body = i.welcomeBody.trim();
  if (!body) return { ok: false, error: "Write the welcome message." };
  if (body.length > SMS_MAX_LENGTH)
    return {
      ok: false,
      error: `Keep the welcome message under ${SMS_MAX_LENGTH} characters.`,
    };
  const codes = parseCountryCodes(i.countryCodes);
  if (!codes.length)
    return {
      ok: false,
      error: "Add at least one country code, for example 1 for Canada and the US.",
    };
  const limit = Math.round(Number(i.dailyLimit));
  if (!Number.isFinite(limit) || limit < 1 || limit > 5000)
    return { ok: false, error: "The daily limit must be between 1 and 5000 texts." };
  if (i.enabled && (!sid || (!token && !i.hasSavedToken) || (!from && !mg)))
    return {
      ok: false,
      error:
        "To switch welcome texts on, add the Account SID, the Auth Token and a Twilio phone number (or Messaging Service SID).",
    };
  return {
    ok: true,
    value: {
      accountSid: sid || null,
      authToken: token || null,
      fromNumber: from,
      messagingServiceSid: mg || null,
      welcomeBody: body,
      countryCodes: codes,
      dailyLimit: limit,
      enabled: i.enabled,
    },
  };
}
