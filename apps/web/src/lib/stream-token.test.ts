import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { playbackUrl, signStreamToken } from "./stream-token";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const pemBase64 = Buffer.from(privateKey).toString("base64");
const decode = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString());

describe("signStreamToken", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const token = signStreamToken({ videoId: "vid123", keyId: "key1", pemBase64, now });
  const [h, p, s] = token.split(".");

  it("carries the video, key and a short expiry", () => {
    expect(decode(h)).toEqual({ alg: "RS256", kid: "key1" });
    const payload = decode(p);
    expect(payload.sub).toBe("vid123");
    expect(payload.exp - payload.nbf).toBeLessThanOrEqual(620);
  });
  it("has a valid RS256 signature", () => {
    const ok = createVerify("RSA-SHA256")
      .update(`${h}.${p}`)
      .verify(publicKey, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });
  it("builds a playback URL that resumes where she stopped", () => {
    expect(playbackUrl("tok", 125.4)).toContain("startTime=125s");
    expect(playbackUrl("tok", 2)).not.toContain("startTime");
  });
});
