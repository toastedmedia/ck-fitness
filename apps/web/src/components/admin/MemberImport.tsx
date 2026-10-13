"use client";
import { useState } from "react";
import { parseCsv, parseMembers, type MemberParse } from "@ck/core";
import { FilePick } from "@/components/admin/FilePick";

type Result = { email: string; status: "created" | "existing" | "failed"; note?: string };
const BATCH = 25;

/** Import people from a CSV (for example Go High Level contacts). Sent in small batches with progress. */
export function MemberImport({
  programs,
}: {
  programs: { id: string; title: string }[];
}) {
  const [parsed, setParsed] = useState<MemberParse | null>(null);
  const [fileName, setFileName] = useState("");
  const [programId, setProgramId] = useState("");
  const [notify, setNotify] = useState(false);
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
    setParsed(parseMembers(parseCsv(await f.text())));
  }

  async function run() {
    if (!parsed) return;
    setBusy(true);
    setError("");
    setDone(0);
    const all: Result[] = [];
    try {
      for (let i = 0; i < parsed.rows.length; i += BATCH) {
        const slice = parsed.rows.slice(i, i + BATCH).map((r) => ({
          first: r.first,
          last: r.last,
          email: r.email,
          phone: r.phone,
        }));
        const res = await fetch("/api/admin/members/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            rows: slice,
            programId: programId || undefined,
            notify,
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
        `${(e as Error).message} ${all.length} people were processed before it stopped. Running it again is safe: existing people are skipped.`,
      );
    } finally {
      setResults(all);
      setBusy(false);
    }
  }

  function report() {
    const rows = [
      ["Email", "Result", "Note"],
      ...(results ?? []).map((r) => [r.email, r.status, r.note ?? ""]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const count = (s: Result["status"]) =>
    results?.filter((r) => r.status === s).length ?? 0;
  const total = parsed?.rows.length ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="text-sm text-muted">
        Use any CSV with an <b>Email</b> column. Names can be <b>First Name</b> and{" "}
        <b>Last Name</b>, or one <b>Name</b> column. <b>Phone</b> is optional. A Go High
        Level contacts export works as it is.
      </div>
      <FilePick accept=".csv,text/csv" label="Choose CSV file" onChange={onFile} />
      {parsed?.missingEmailColumn ? (
        <p role="alert" className="text-sm font-bold text-danger">
          That file has no Email column. Check the first row of the file.
        </p>
      ) : null}
      {parsed && !parsed.missingEmailColumn ? (
        <div className="rounded-xl border border-line p-3 text-sm">
          <b>{fileName}</b>: {total} people ready to import
          {parsed.duplicates ? `, ${parsed.duplicates} repeated emails skipped` : ""}
          {parsed.invalid.length
            ? `, ${parsed.invalid.length} rows without a valid email skipped`
            : ""}
          .
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="py-1 pr-2">First</th>
                  <th className="py-1 pr-2">Last</th>
                  <th className="py-1 pr-2">Email</th>
                  <th className="py-1">Phone</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 5).map((r) => (
                  <tr key={r.email} className="border-t border-line">
                    <td className="py-1 pr-2">{r.first || "-"}</td>
                    <td className="py-1 pr-2">{r.last || "-"}</td>
                    <td className="py-1 pr-2">{r.email}</td>
                    <td className="py-1">{r.phone ?? "-"}</td>
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
          <label className="text-xs font-bold text-brand">
            Give everyone access to a program (optional)
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className="mt-1 min-h-10 w-full rounded-xl border-2 border-line bg-surface px-3 text-sm font-normal"
            >
              <option value="">No program, just create their accounts</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="mt-0.5 size-5 accent-brand"
            />
            <span>
              <b className="block text-brand">
                Email each new person a link to set a password
              </b>
              <span className="text-xs text-muted">
                Leave this off until email sending (Resend) is connected and you are ready
                to invite them. Without it, people sign in later with Forgot password.
              </span>
            </span>
          </label>
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="min-h-11 self-start rounded-button bg-brand px-6 text-sm font-bold text-on-brand disabled:opacity-60"
          >
            {busy ? `Importing ${done} of ${total}...` : `Import ${total} people`}
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
          <b>Done.</b> {count("created")} new accounts, {count("existing")} already had
          accounts, {count("failed")} could not be added.
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
