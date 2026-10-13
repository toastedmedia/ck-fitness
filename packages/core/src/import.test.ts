import { describe, expect, it } from "vitest";
import { parseCsv, parseProgramImport } from "./import";

const HEADER =
  "program_name,status_current_outdated_duplicate,access_level,category,level,delivery,duration,section_or_week,lesson_title,source_video_filename,stream_video_id,written_instructions_ready,thumbnail_ready,safety_notes_approved,publish_in_phase_1";

describe("parseCsv", () => {
  it("handles quotes, commas, doubled quotes and Windows line endings", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });
  it("ignores blank lines and a byte-order mark", () =>
    expect(parseCsv("﻿a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]));
});

describe("parseProgramImport", () => {
  it("groups lessons into sections and trainings, and keeps only current Phase 1 rows", () => {
    const csv = [
      HEADER,
      "Core,Current,free,Core & Pelvic Floor,Beginner,Home,5 days,Week 1,Day 1,d1.mp4,abc123,Yes,Yes,Yes,Yes",
      "Core,Current,free,Core & Pelvic Floor,Beginner,Home,5 days,Week 1,Day 2,d2.mp4,,Yes,Yes,Yes,Yes",
      "Core,Outdated,free,,,,,Week 1,Old day,old.mp4,,,,,Yes",
      "Strength,Current,member,Strength & Sculpt,Intermediate/Advanced,Gym/Home,8 weeks,Week 1,Squat,s.mp4,,No,No,No,No",
    ].join("\n");
    const r = parseProgramImport(csv);
    expect(r.problems).toEqual([]);
    expect(r.programs).toHaveLength(1);
    expect(r.programs[0]).toMatchObject({
      name: "Core",
      access: "free",
      level: "beginner",
      delivery: ["Home"],
    });
    expect(r.programs[0].sections[0].lessons.map((l) => [l.title, l.streamUid])).toEqual([
      ["Day 1", "abc123"],
      ["Day 2", null],
    ]);
    expect(r.skipped).toHaveLength(2);
  });
  it("reports missing columns, bad access levels and incomplete rows in plain English", () => {
    expect(parseProgramImport("name,thing\nx,y").problems[0]).toMatch(/Missing columns/);
    const bad = parseProgramImport(
      `${HEADER}\nP,Current,gold,,,,,,L,,,,,,Yes\n,Current,free,,,,,,,,,,,,Yes`,
    );
    expect(bad.problems[0]).toMatch(/Row 2: access level "gold"/);
    expect(bad.problems[1]).toMatch(/Row 3: needs a program name/);
  });
  it("needs at least one data row", () =>
    expect(parseProgramImport(HEADER).problems[0]).toMatch(/no rows/));
});
