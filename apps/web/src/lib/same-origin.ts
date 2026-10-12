import type { NextRequest } from "next/server";

/**
 * Extra protection for endpoints that change things (delete account, checkout, sign out).
 * Browsers send an Origin header on form posts; it must match this site. Requests with no Origin
 * (for example server-to-server) are not accepted for these endpoints.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

/** A link that stays inside the app: starts with a single slash. Blocks "//evil.com" and "/\evil.com". */
export function isInternalPath(value: string): boolean {
  return /^\/(?![/\\])/.test(value);
}
