/**
 * Leads (our own CRM): reading a contacts export (Go High Level or any spreadsheet), who may be
 * emailed under Canada's anti-spam law (CASL), and email automation timing. Pure and tested.
 */
import { normalizePhone, splitName } from "./members";
import { normalizeTagName } from "./tags";

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const H = {
  first: ["firstname", "first", "givenname", "fname"],
  last: ["lastname", "last", "surname", "familyname", "lname"],
  full: ["name", "fullname", "contactname", "customername"],
  email: ["email", "emailaddress", "mail", "primaryemail", "contactemail"],
  phone: [
    "phone",
    "phonenumber",
    "mobile",
    "mobilephone",
    "cell",
    "cellphone",
    "telephone",
    "primaryphone",
  ],
  tags: ["tags", "tag", "labels", "contacttags"],
  source: ["source", "contactsource", "leadsource", "origin"],
  created: [
    "created",
    "datecreated",
    "dateadded",
    "createdat",
    "createdon",
    "datecreatedutc",
  ],
  notes: ["notes", "note", "description", "comments"],
  dnd: ["dnd", "donotdisturb", "emaildnd", "unsubscribed", "optedout"],
  id: ["contactid", "id", "ghlid", "externalid"],
};

export interface LeadRow {
  line: number;
  first: string;
  last: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  source: string;
  /** When they first contacted us (ISO), if the file says. */
  created: string | null;
  notes: string;
  /** The file says they asked not to be contacted. */
  dnd: boolean;
  externalId: string;
}
export interface LeadParse {
  rows: LeadRow[];
  invalid: { line: number; reason: string }[];
  duplicates: number;
  /** No email AND no phone column: nothing to match people on. */
  missingColumns: boolean;
  /** All tag names found in the file (for the preview). */
  fileTags: string[];
}

/** Splits "a, b; c" into clean tag names (max 30 characters each), no repeats. */
export function splitTags(raw: string): string[] {
  const out: string[] = [];
  for (const t of raw.split(/[,;|]/)) {
    const n = normalizeTagName(t);
    if (n && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
  }
  return out;
}

const yes = (v: string) => /^(true|yes|y|1|dnd|all)$/i.test(v.trim());

function isoOf(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) || d.getFullYear() < 2000 ? null : d.toISOString();
}

/** Reads a contacts table. A person needs an email or a phone number; repeats are skipped. */
export function parseLeads(table: string[][]): LeadParse {
  const out: LeadParse = {
    rows: [],
    invalid: [],
    duplicates: 0,
    missingColumns: false,
    fileTags: [],
  };
  if (!table.length) return { ...out, missingColumns: true };
  const heads = table[0].map(norm);
  const at = (k: keyof typeof H) => heads.findIndex((h) => H[k].includes(h));
  const i = Object.fromEntries(
    Object.keys(H).map((k) => [k, at(k as keyof typeof H)]),
  ) as Record<keyof typeof H, number>;
  if (i.email < 0 && i.phone < 0) return { ...out, missingColumns: true };
  const seen = new Set<string>();
  const tagSet = new Map<string, string>();
  table.slice(1).forEach((r, idx) => {
    const line = idx + 1;
    if (r.every((c) => !c.trim())) return;
    const get = (j: number) => (j >= 0 ? (r[j] ?? "").trim() : "");
    const rawEmail = get(i.email).toLowerCase();
    const email = EMAIL.test(rawEmail) ? rawEmail : null;
    const phone = normalizePhone(get(i.phone));
    if (!email && !phone) {
      out.invalid.push({ line, reason: "No valid email or phone number" });
      return;
    }
    const key = email ?? `p:${phone}`;
    if (seen.has(key)) {
      out.duplicates++;
      return;
    }
    seen.add(key);
    let first = get(i.first);
    let last = get(i.last);
    if (!first && !last && i.full >= 0) ({ first, last } = splitName(get(i.full)));
    const tags = splitTags(get(i.tags));
    for (const t of tags)
      if (!tagSet.has(t.toLowerCase())) tagSet.set(t.toLowerCase(), t);
    out.rows.push({
      line,
      first: first.slice(0, 80),
      last: last.slice(0, 80),
      email,
      phone,
      tags,
      source: get(i.source).slice(0, 60),
      created: isoOf(get(i.created)),
      notes: get(i.notes).slice(0, 4000),
      dnd: i.dnd >= 0 && yes(get(i.dnd)),
      externalId: get(i.id).slice(0, 80),
    });
  });
  out.fileTags = [...tagSet.values()].sort((a, b) => a.localeCompare(b));
  return out;
}

/** How we may email someone (CASL). Express consent never expires; implied consent has an end date. */
export type ConsentChoice = "express" | "implied" | "none";

const DAY = 86400000;
/** CASL implied consent: 2 years after a purchase or contract, 6 months after an enquiry. */
export function impliedUntil(from: Date | string, kind: "customer" | "enquiry"): string {
  const t = new Date(from).getTime();
  return new Date(t + (kind === "customer" ? 730 : 182) * DAY).toISOString();
}

/** May this lead get marketing email now? */
export function leadEmailable(
  c: {
    email: string | null;
    email_consent_at: string | null;
    implied_consent_until: string | null;
    unsubscribed_at: string | null;
  },
  now: Date = new Date(),
): boolean {
  if (!c.email || c.unsubscribed_at) return false;
  if (c.email_consent_at) return true;
  return Boolean(c.implied_consent_until && new Date(c.implied_consent_until) > now);
}

/* --------------------------------------------------------- automations */

export const AUTOMATION_TRIGGERS = [
  { key: "tag_added", label: "A tag is added" },
  { key: "stage", label: "Moves to a stage" },
  { key: "new_lead", label: "A new lead arrives" },
  { key: "booked", label: "Books a consultation" },
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number]["key"];

export interface AutomationStep {
  /** Days after the previous step (the first step: after they enter). 0 = straight away. */
  delay_days: number;
  subject: string;
  heading: string;
  body: string;
  cta_label: string;
  cta_url: string;
}

/** When the next email of a sequence is due, or null when the sequence is finished. */
export function nextStepAt(
  steps: Pick<AutomationStep, "delay_days">[],
  stepIndex: number,
  from: Date | string,
): string | null {
  const s = steps[stepIndex];
  if (!s) return null;
  const days = Math.max(0, Math.min(365, Number(s.delay_days) || 0));
  return new Date(new Date(from).getTime() + days * DAY).toISOString();
}

/** Cleans steps typed in the admin: at most 10, each needs a subject and a body. */
export function cleanSteps(raw: Partial<AutomationStep>[]): AutomationStep[] {
  return raw
    .map((s) => ({
      delay_days: Math.max(0, Math.min(365, Math.round(Number(s.delay_days) || 0))),
      subject: String(s.subject ?? "")
        .trim()
        .slice(0, 150),
      heading: String(s.heading ?? "")
        .trim()
        .slice(0, 150),
      body: String(s.body ?? "")
        .trim()
        .slice(0, 6000),
      cta_label: String(s.cta_label ?? "")
        .trim()
        .slice(0, 40),
      cta_url: String(s.cta_url ?? "")
        .trim()
        .slice(0, 500),
    }))
    .filter((s) => s.subject && s.body)
    .slice(0, 10);
}
