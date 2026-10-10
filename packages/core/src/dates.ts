/** Date helpers that work on plain YYYY-MM-DD "day keys" in the member's own timezone. */
export const DEFAULT_TZ = "America/Vancouver";

export function dayKey(date: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** 0 = Monday ... 6 = Sunday */
export function dayOfWeek(key: string): number {
  return (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function weekStart(key: string): string {
  return addDays(key, -dayOfWeek(key));
}

export function daysBetween(from: string, to: string): number {
  const ms =
    new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

export function hourIn(date: Date, tz: string = DEFAULT_TZ): number {
  return (
    Number(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        hour: "numeric",
        hour12: false,
      }).format(date),
    ) % 24
  );
}

export function greeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
