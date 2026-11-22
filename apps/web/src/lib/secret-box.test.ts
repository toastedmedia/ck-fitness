import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  serverEnv: () => ({
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  }),
}));

const { openSecret, sealSecret } = await import("./secret-box");

afterEach(() => vi.unstubAllEnvs());

describe("secret box", () => {
  it("seals a secret so the stored text does not show it, and opens it again", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-key-1");
    const token = "0123456789abcdef0123456789abcdef";
    const sealed = sealSecret(token);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain(token);
    expect(sealSecret(token)).not.toBe(sealed); // a fresh random start each time
    expect(openSecret(sealed)).toBe(token);
  });

  it("cannot be opened with another server key or when damaged", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-key-1");
    const sealed = sealSecret("abc");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-key-2");
    expect(openSecret(sealed)).toBeNull();
    expect(openSecret("v1:not-base64-%%%")).toBeNull();
    expect(openSecret(null)).toBeNull();
    expect(openSecret("plain")).toBeNull();
  });
});
