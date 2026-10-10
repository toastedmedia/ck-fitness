import { createSign } from "node:crypto";

/**
 * Cloudflare Stream signed playback token (RS256 JWT). Short lived by design: the player asks
 * for a fresh one right before playback, and the server only issues it to members with access.
 */
const b64url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

export function signStreamToken(opts: {
  videoId: string;
  keyId: string;
  pemBase64: string;
  ttlSeconds?: number;
  now?: Date;
}): string {
  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const header = { alg: "RS256", kid: opts.keyId };
  const payload = {
    sub: opts.videoId,
    kid: opts.keyId,
    nbf: nowSec - 10,
    exp: nowSec + (opts.ttlSeconds ?? 600),
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const pem = Buffer.from(opts.pemBase64, "base64").toString("utf8");
  const signature = createSign("RSA-SHA256").update(unsigned).sign(pem);
  return `${unsigned}.${b64url(signature)}`;
}

export function playbackUrl(token: string, startSeconds = 0): string {
  const start = startSeconds > 5 ? `&startTime=${Math.floor(startSeconds)}s` : "";
  return `https://iframe.videodelivery.net/${token}?autoplay=true${start}`;
}
