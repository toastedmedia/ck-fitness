/** Reading a list of people (for example a Go High Level contacts export) into members. */
export interface MemberRow {
  line: number; // 1-based row number in the file, header excluded
  first: string;
  last: string;
  email: string;
  phone: string | null;
  notes: string[]; // things we fixed or ignored, shown in the report
}
export interface MemberParse {
  rows: MemberRow[];
  invalid: { line: number; reason: string; raw: string }[];
  duplicates: number;
  missingEmailColumn: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Canadian/US numbers get +1; anything with a plus keeps it; junk becomes null. */
export function normalizePhone(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, "");
  if (t.startsWith("+"))
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

const FIRST = ["firstname", "first", "givenname", "fname"];
const LAST = ["lastname", "last", "surname", "familyname", "lname"];
const FULL = ["name", "fullname", "contactname", "customername"];
const MAIL = ["email", "emailaddress", "mail", "primaryemail", "contactemail"];
const PHONE = [
  "phone",
  "phonenumber",
  "mobile",
  "mobilephone",
  "cell",
  "cellphone",
  "telephone",
  "primaryphone",
];

/** Accepts the common header spellings from Go High Level and spreadsheets. */
export function parseMembers(table: string[][]): MemberParse {
  const out: MemberParse = {
    rows: [],
    invalid: [],
    duplicates: 0,
    missingEmailColumn: false,
  };
  if (table.length === 0) return { ...out, missingEmailColumn: true };
  const heads = table[0].map(norm);
  const find = (names: string[]) => heads.findIndex((h) => names.includes(h));
  const iFirst = find(FIRST),
    iLast = find(LAST),
    iFull = find(FULL),
    iMail = find(MAIL),
    iPhone = find(PHONE);
  if (iMail < 0) return { ...out, missingEmailColumn: true };
  const seen = new Set<string>();
  table.slice(1).forEach((r, idx) => {
    const line = idx + 1;
    if (r.every((c) => !c.trim())) return;
    const get = (i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
    const email = get(iMail).toLowerCase();
    if (!EMAIL.test(email)) {
      out.invalid.push({
        line,
        reason: "Missing or invalid email",
        raw: r.join(",").slice(0, 80),
      });
      return;
    }
    if (seen.has(email)) {
      out.duplicates++;
      return;
    }
    seen.add(email);
    let first = get(iFirst).slice(0, 60);
    let last = get(iLast).slice(0, 60);
    if (!first && !last && iFull >= 0) ({ first, last } = splitName(get(iFull)));
    first = first.slice(0, 60);
    last = last.slice(0, 60);
    const notes: string[] = [];
    const rawPhone = get(iPhone);
    const phone = normalizePhone(rawPhone);
    if (rawPhone && !phone) notes.push("Phone number ignored (not a valid number)");
    out.rows.push({ line, first, last, email, phone, notes });
  });
  return out;
}
