import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Encrypts small secrets typed into Admin (for example the Twilio Auth Token) before they are stored
 * in the database, so a database export alone never reveals them. AES-256-GCM with a key derived from
 * the server's Supabase service key (never in the browser). If that key changes (for example when
 * moving to the production Supabase project), old secrets cannot be read and must be typed again.
 */
function key(): Buffer {
  return createHash("sha256")
    .update(`ck-admin-secret-v1:${serverEnv().supabaseServiceRoleKey}`)
    .digest();
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), data]).toString("base64")}`;
}

/** The secret, or null when it was sealed with another key or is damaged. */
export function openSecret(sealed: string | null | undefined): string | null {
  if (!sealed?.startsWith("v1:")) return null;
  try {
    const raw = Buffer.from(sealed.slice(3), "base64");
    const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
