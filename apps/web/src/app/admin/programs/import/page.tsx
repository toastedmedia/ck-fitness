import type { Metadata } from "next";
import Link from "next/link";
import { ABtn, Flash, H1, Panel, aInput } from "@/components/admin/ui";
import { CONTENT, requireStaff } from "@/lib/admin";
import { importPrograms } from "../../actions";

export const metadata: Metadata = { title: "Import programs" };

export default async function ImportPrograms({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; problems?: string }>;
}) {
  const sp = await searchParams;
  await requireStaff(CONTENT);
  const [programs, lessons] = (sp.done ?? "").split("-");
  const notes = (sp.problems ?? "").split("|").filter(Boolean);
  return (
    <>
      <H1
        right={
          <Link href="/admin/programs" className="text-sm font-bold text-brand underline">
            Back to programs
          </Link>
        }
      >
        Import programs
      </H1>
      {sp.done ? (
        <Flash>
          Created {programs} draft program(s) with {lessons} lesson(s). Nothing is
          published until you check and publish each one.
        </Flash>
      ) : null}
      {notes.length ? (
        <Panel title="Notes">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Panel>
      ) : null}
      <Panel title="Upload your program spreadsheet">
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Download the template, fill in one row per lesson, and save it as CSV.</li>
          <li>
            Upload it here. Programs are created as <b>drafts</b>, never published.
          </li>
          <li>Rows marked Outdated or Duplicate, or not for Phase 1, are skipped.</li>
          <li>
            Paste each Cloudflare video ID in the stream_video_id column, or add it later
            in the editor.
          </li>
        </ol>
        <p className="mb-3">
          <a
            href="/program-import-template.csv"
            download
            className="text-sm font-bold text-brand underline"
          >
            Download the template (CSV)
          </a>
        </p>
        <form
          action={importPrograms}
          className="flex flex-col gap-3"
          encType="multipart/form-data"
        >
          <input type="file" name="file" accept=".csv,text/csv" className="text-sm" />
          <details>
            <summary className="cursor-pointer text-sm font-bold text-brand">
              Or paste the CSV text
            </summary>
            <textarea
              name="csv"
              rows={8}
              className={`${aInput} mt-2 py-2 font-mono text-xs`}
            />
          </details>
          <ABtn variant="primary" className="self-start">
            Import as drafts
          </ABtn>
        </form>
      </Panel>
    </>
  );
}
