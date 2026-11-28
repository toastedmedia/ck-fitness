"use client";
import Link from "next/link";
import { useState } from "react";
import {
  CRM_SOURCES,
  CRM_STAGES,
  parseCsv,
  parseLeads,
  splitTags,
  type LeadParse,
} from "@ck/core";
import { FilePick } from "@/components/admin/FilePick";

type Result = { key: string; status: "created" | "updated" | "failed"; note?: string };
const BATCH = 100;
const field =
  "mt-1 min-h-11 w-full rounded-xl border-2 border-line bg-surface px-3 text-sm font-normal";

/** Import leads from a CSV (a Go High Level contacts export works as it is), with tags for everyone. */
export function LeadImport({ tags }: { tags: string[] }) {
  const [parsed, setParsed] = useState<LeadParse | null>(null);
  const [fileName, setFileName] = useState("");
  const [tagText, setTagText] = useState("");
  const [useFileTags, setUseFileTags] = useState(true);
  const [source, setSource] = useState("other");
  const [stage, setStage] = useState("new");
  const [consent, setConsent] = useState("");
  const [automations, setAutomations] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setResults(null);
    setError("");
    if (!f) return setParsed(null);
    setFileName(f.name);
    setParsed(parseLeads(parseCsv(await f.text())));
  }
  const chosenTags = splitTags(tagText);

  async function run() {
    if (!parsed || !consent) return;
    setBusy(true);
    setError("");
    setDone(0);
    const all: Result[] = [];
    try {
      for (let i = 0; i < parsed.rows.length; i += BATCH) {
        const res = await fetch("/api/admin/leads/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            rows: parsed.rows.slice(i, i + BATCH),
            tags: chosenTags,
            useFileTags,
            source,
            stage,
            consent,
            automations,
            fileName,
            first: i === 0,
          }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          results?: Result[];
          error?: string;
        };
        if (!res.ok || !j.results) throw new Error(j.error ?? "The import stopped.");
        all.push(...j.results);
        setDone(Math.min(i + BATCH, parsed.rows.length));
      }
    } catch (e) {
      setError(
        `${(e as Error).message} ${all.length} people were saved before it stopped. Running the same file again is safe: people already here are updated, not doubled.`,
      );
    } finally {
      setResults(all);
      setBusy(false);
    }
  }

  function report() {
    const rows = [
      ["Email or phone", "Result", "Note"],
      ...(results ?? []).map((r) => [r.key, r.status, r.note ?? ""]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads-import-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  const count = (s: Result["status"]) =>
    results?.filter((r) => r.status === s).length ?? 0;
  const total = parsed?.rows.length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>
          In Go High Level: <b>Contacts → select all → Export</b> (all columns). Any
          spreadsheet saved as CSV works too: it needs an <b>Email</b> or <b>Phone</b>{" "}
          column.
        </li>
        <li>
          Choose the file below, check the preview, pick the tags and the email
          permission, then Import.
        </li>
      </ol>
      <FilePick accept=".csv,text/csv" label="Choose CSV file" onChange={onFile} />
      {parsed?.missingColumns ? (
        <p role="alert" className="text-sm font-bold text-danger">
          That file has no Email or Phone column. Check the first row of the file.
        </p>
      ) : null}
      {parsed && !parsed.missingColumns ? (
        <div className="rounded-xl border border-line p-3 text-sm">
          <b>{fileName}</b>: <b>{total}</b> people ready
          {parsed.duplicates ? `, ${parsed.duplicates} repeats skipped` : ""}
          {parsed.invalid.length
            ? `, ${parsed.invalid.length} rows with no valid email or phone skipped`
            : ""}
          . {parsed.rows.filter((r) => !r.email).length} have a phone but no email;{" "}
          {parsed.rows.filter((r) => r.dnd).length} are marked do-not-disturb (they will
          never be emailed).
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-2">Name</th>
                  <th className="py-1 pr-2">Email</th>
                  <th className="py-1 pr-2">Phone</th>
                  <th className="py-1">Tags in the file</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 5).map((r) => (
                  <tr key={r.line} className="border-t border-line">
                    <td className="py-1 pr-2">{`${r.first} ${r.last}`.trim() || "-"}</td>
                    <td className="py-1 pr-2">{r.email ?? "-"}</td>
                    <td className="py-1 pr-2">{r.phone ?? "-"}</td>
                    <td className="py-1">{r.tags.join(", ") || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-muted">First 5 rows shown.</p>
        </div>
      ) : null}

      {parsed && total > 0 ? (
        <>
          <fieldset className="grid gap-3 rounded-xl border-2 border-line p-3">
            <legend className="px-1 text-sm font-bold text-brand">
              Tags (so you know where these leads came from)
            </legend>
            <label className="text-xs font-bold text-brand">
              Add these tags to everyone in the file (separate with commas)
              <input
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                list="lead-tag-options"
                placeholder="GHL import Dec 2026, Facebook leads 2025"
                className={field}
              />
              <datalist id="lead-tag-options">
                {tags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </label>
            {chosenTags.length ? (
              <p className="flex flex-wrap gap-1">
                {chosenTags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-page px-2 py-0.5 text-xs font-bold text-brand"
                  >
                    {t}
                    {tags.some((x) => x.toLowerCase() === t.toLowerCase())
                      ? ""
                      : " (new)"}
                  </span>
                ))}
              </p>
            ) : null}
            {parsed.fileTags.length ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={useFileTags}
                  onChange={(e) => setUseFileTags(e.target.checked)}
                  className="mt-0.5 size-5 accent-brand"
                />
                <span>
                  <b className="text-brand">
                    Also keep each person&apos;s own tags from the file
                  </b>{" "}
                  <span className="text-xs text-muted">
                    ({parsed.fileTags.length} different:{" "}
                    {parsed.fileTags.slice(0, 12).join(", ")}
                    {parsed.fileTags.length > 12 ? "…" : ""})
                  </span>
                </span>
              </label>
            ) : null}
            <p className="text-xs text-muted">
              You can add, change or remove tags any time later, one by one or in bulk.
            </p>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-brand">
              Where they came from
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className={field}
              >
                {CRM_SOURCES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-brand">
              Stage for new people (people already here keep theirs)
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className={field}
              >
                {CRM_STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="grid gap-2 rounded-xl border-2 border-line p-3 text-sm">
            <legend className="px-1 text-sm font-bold text-brand">
              May we email them? (Canada&apos;s anti-spam law)
            </legend>
            {[
              [
                "express",
                "Yes, they agreed to get our emails",
                "For example they ticked a newsletter or offers box. Never expires (until they unsubscribe).",
              ],
              [
                "implied_customer",
                "They are or were clients (paid or trained with us)",
                "Allowed for 2 years after the date they were added in the file.",
              ],
              [
                "implied_enquiry",
                "They asked about our services (enquiry, form, DM)",
                "Allowed for 6 months after the date they were added in the file.",
              ],
              [
                "none",
                "Not sure: do not email them yet",
                "They are saved, but no email goes to them until you record permission.",
              ],
            ].map(([v, label, help]) => (
              <label key={v} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="consent"
                  value={v}
                  checked={consent === v}
                  onChange={() => setConsent(v!)}
                  className="mt-1 size-4 accent-brand"
                />
                <span>
                  <b>{label}</b> <span className="block text-xs text-muted">{help}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={automations}
              onChange={(e) => setAutomations(e.target.checked)}
              className="mt-0.5 size-5 accent-brand"
            />
            <span>
              <b className="text-brand">
                Start matching email automations for these people
              </b>{" "}
              <span className="block text-xs text-muted">
                Leave off for an old list, so 1,700 people do not get a &quot;welcome, new
                lead&quot; email at once.
              </span>
            </span>
          </label>

          <button
            type="button"
            onClick={run}
            disabled={busy || !consent}
            className="min-h-12 self-start rounded-button bg-brand px-6 text-sm font-bold text-on-brand disabled:opacity-60"
          >
            {busy
              ? `Importing ${done} of ${total}…`
              : consent
                ? `Import ${total} people`
                : "Choose the email permission first"}
          </button>
        </>
      ) : null}
      {busy ? (
        <div
          className="h-2 overflow-hidden rounded-full bg-line"
          role="status"
          aria-live="polite"
        >
          <div
            className="h-full bg-accent-strong"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-bold text-danger">
          {error}
        </p>
      ) : null}
      {results ? (
        <div className="rounded-xl border border-line p-3 text-sm" role="status">
          <b>Done.</b> {count("created")} new leads, {count("updated")} already here
          (updated), {count("failed")} could not be added.{" "}
          <Link href="/admin/leads?view=list" className="font-bold text-brand underline">
            See the leads
          </Link>
          <div className="mt-2">
            <button
              type="button"
              onClick={report}
              className="min-h-10 rounded-xl border-2 border-line px-4 text-sm font-bold text-brand"
            >
              Download the report (CSV)
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
