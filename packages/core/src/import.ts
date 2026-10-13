import type { AccessLevel } from "./access";

/** Program migration helper (Build Guide §22): turns CK's inventory spreadsheet into draft programs. */
export interface ImportLesson {
  title: string;
  streamUid: string | null;
  sourceFile: string;
}
export interface ImportSection {
  title: string;
  lessons: ImportLesson[];
}
export interface ImportProgram {
  name: string;
  access: AccessLevel;
  category: string;
  level: "beginner" | "intermediate" | "advanced" | null;
  delivery: string[];
  duration: string;
  sections: ImportSection[];
}
export interface ImportResult {
  programs: ImportProgram[];
  skipped: string[];
  problems: string[];
}

/** Small CSV reader that understands quotes, commas inside quotes and Windows line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const ACCESS: AccessLevel[] = [
  "free",
  "member",
  "premium_preview",
  "coach_only",
  "hidden",
];
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_");
const yes = (s: string | undefined) => (s ?? "").trim().toLowerCase().startsWith("y");

export function parseProgramImport(text: string): ImportResult {
  const table = parseCsv(text);
  const result: ImportResult = { programs: [], skipped: [], problems: [] };
  if (table.length < 2) {
    result.problems.push(
      "The file has no rows. Use the template and add one row per lesson.",
    );
    return result;
  }
  const header = table[0].map(norm);
  const col = (name: string) => header.indexOf(name);
  const need = ["program_name", "access_level", "lesson_title"];
  const missing = need.filter((n) => col(n) < 0);
  if (missing.length) {
    result.problems.push(
      `Missing columns: ${missing.join(", ")}. Start from docs/program-import-template.csv.`,
    );
    return result;
  }
  const get = (r: string[], name: string) =>
    col(name) >= 0 ? (r[col(name)] ?? "").trim() : "";
  const byName = new Map<string, ImportProgram>();

  table.slice(1).forEach((r, i) => {
    const line = i + 2;
    const name = get(r, "program_name");
    const lesson = get(r, "lesson_title");
    if (!name || !lesson)
      return result.problems.push(
        `Row ${line}: needs a program name and a lesson title.`,
      );
    const status = get(r, "status_current_outdated_duplicate");
    if (status && !/^current/i.test(status))
      return result.skipped.push(`Row ${line}: "${lesson}" is marked ${status}.`);
    if (col("publish_in_phase_1") >= 0 && !yes(get(r, "publish_in_phase_1")))
      return result.skipped.push(`Row ${line}: "${lesson}" is not for Phase 1.`);

    const access = norm(get(r, "access_level")) as AccessLevel;
    if (!ACCESS.includes(access))
      return result.problems.push(
        `Row ${line}: access level "${get(r, "access_level")}" must be one of ${ACCESS.join(", ")}.`,
      );

    let p = byName.get(name);
    if (!p) {
      const lvl = norm(get(r, "level").split("/")[0]);
      p = {
        name,
        access,
        category: get(r, "category"),
        level:
          lvl === "beginner" || lvl === "intermediate" || lvl === "advanced" ? lvl : null,
        delivery: get(r, "delivery")
          .split("/")
          .map((d) => d.trim())
          .filter(Boolean),
        duration: get(r, "duration"),
        sections: [],
      };
      byName.set(name, p);
    }
    const sectionTitle = get(r, "section_or_week") || "Lessons";
    let s = p.sections.find((x) => x.title === sectionTitle);
    if (!s) {
      s = { title: sectionTitle, lessons: [] };
      p.sections.push(s);
    }
    s.lessons.push({
      title: lesson,
      streamUid: get(r, "stream_video_id") || null,
      sourceFile: get(r, "source_video_filename"),
    });
  });
  result.programs = [...byName.values()];
  return result;
}
