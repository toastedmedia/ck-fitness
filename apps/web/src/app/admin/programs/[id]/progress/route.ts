import { NextResponse } from "next/server";
import { CONTENT, requireStaff } from "@/lib/admin";
import { loadProgramProgress } from "@/lib/program-progress";

export const dynamic = "force-dynamic";

const cell = (v: string | number) => {
  const t = String(v);
  // Stops spreadsheet programs from running a name or email that starts with = + - @ as a formula.
  const safe = /^[=+\-@]/.test(t) ? `'${t}` : t;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** CSV export of member progress for one program. Staff with content access only. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireStaff([...CONTENT, "coach"]);
  const s = await loadProgramProgress(db, id);
  const lines = [
    [
      "Name",
      "Email",
      "Lessons done",
      "Total lessons",
      "Progress %",
      "Enrolled",
      "Last accessed",
      "Sessions",
    ]
      .map(cell)
      .join(","),
    ...s.members.map((m) =>
      [
        m.name,
        m.email,
        m.completedLessons,
        m.totalLessons,
        m.percent,
        m.enrolledAt.slice(0, 10),
        m.lastAccessed?.slice(0, 10) ?? "",
        m.sessions,
      ]
        .map(cell)
        .join(","),
    ),
  ];
  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="program-progress.csv"`,
      "cache-control": "no-store",
    },
  });
}
