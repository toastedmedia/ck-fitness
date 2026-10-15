import { createHmac, timingSafeEqual } from "node:crypto";

/** A signed link that turns optional emails off for one member without needing her to sign in. */
const secret = () => process.env.CRON_SECRET ?? "";

export function signUnsubscribe(userId: string): string {
  const mac = createHmac("sha256", secret())
    .update(`unsub:${userId}`)
    .digest("base64url");
  return `${userId}.${mac}`;
}

export function verifyUnsubscribe(token: string): string | null {
  const i = token.lastIndexOf(".");
  if (i < 0 || !secret()) return null;
  const userId = token.slice(0, i);
  const given = token.slice(i + 1);
  const want = createHmac("sha256", secret())
    .update(`unsub:${userId}`)
    .digest("base64url");
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return /^[0-9a-f-]{36}$/.test(userId) ? userId : null;
}
