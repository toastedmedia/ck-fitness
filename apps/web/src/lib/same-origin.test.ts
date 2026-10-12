import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { isInternalPath, isSameOrigin } from "./same-origin";

const req = (headers: Record<string, string>) =>
  ({
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  }) as unknown as NextRequest;

describe("isInternalPath", () => {
  it("allows in-app paths", () => {
    expect(isInternalPath("/programs")).toBe(true);
    expect(isInternalPath("/programs/x?y=1#z")).toBe(true);
  });
  it("blocks off-site and protocol-relative links", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "programs",
      "",
    ])
      expect(isInternalPath(bad)).toBe(false);
  });
});

describe("isSameOrigin", () => {
  it("accepts a matching origin", () =>
    expect(isSameOrigin(req({ origin: "https://app.ck.com", host: "app.ck.com" }))).toBe(
      true,
    ));
  it("rejects another site and a missing origin", () => {
    expect(isSameOrigin(req({ origin: "https://evil.com", host: "app.ck.com" }))).toBe(
      false,
    );
    expect(isSameOrigin(req({ host: "app.ck.com" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "not a url", host: "app.ck.com" }))).toBe(false);
  });
});
