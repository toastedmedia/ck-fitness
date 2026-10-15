/** Member tags are short internal labels. Names are compared without caring about capital letters. */
export function normalizeTagName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 30);
}
export const sameTag = (a: string, b: string) =>
  normalizeTagName(a).toLowerCase() === normalizeTagName(b).toLowerCase();
export const MAX_BULK = 2000;
export const MAX_BULK_ACCESS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Keeps only valid member ids, with no repeats, up to a safe limit. */
export function cleanIds(values: unknown[], max = MAX_BULK): string[] {
  return [...new Set(values.map(String).filter((v) => UUID.test(v)))].slice(0, max);
}
