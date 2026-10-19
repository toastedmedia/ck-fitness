/**
 * A training is a flat, ordered list of sections. A "phase" is a heading: every week or module listed after
 * it (until the next phase) belongs to it. Pure helpers so ordering rules are tested.
 */
export interface SectionRef {
  id: string;
  section_type: string;
}

/** Where a new section goes (index in the current list). Weeks/modules can go inside a phase, at its end. */
export function insertIndex(rows: SectionRef[], type: string, phaseId: string): number {
  const pi = rows.findIndex((r) => r.id === phaseId && r.section_type === "phase");
  if (type === "phase" || pi < 0) return rows.length;
  let at = pi + 1;
  while (at < rows.length && rows[at].section_type !== "phase") at++;
  return at;
}

/** New order of ids when a phase moves up or down past its neighbouring phase (its weeks travel with it). */
export function movePhase(
  rows: SectionRef[],
  id: string,
  dir: "up" | "down",
): string[] | null {
  const blocks: SectionRef[][] = [];
  for (const r of rows) {
    if (r.section_type === "phase" || blocks.length === 0) blocks.push([r]);
    else blocks[blocks.length - 1].push(r);
  }
  const at = blocks.findIndex((b) => b[0].id === id && b[0].section_type === "phase");
  const to = dir === "up" ? at - 1 : at + 1;
  if (at < 0 || to < 0 || to >= blocks.length || blocks[to][0].section_type !== "phase")
    return null;
  [blocks[at], blocks[to]] = [blocks[to], blocks[at]];
  return blocks.flat().map((r) => r.id);
}

/** Which phase (if any) a section sits under. */
export function phaseOf(rows: SectionRef[], id: string): string | null {
  let current: string | null = null;
  for (const r of rows) {
    if (r.section_type === "phase") current = r.id;
    if (r.id === id) return r.section_type === "phase" ? null : current;
  }
  return null;
}
