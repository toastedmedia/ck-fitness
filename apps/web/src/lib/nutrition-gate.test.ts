import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const notFound = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

const state = {
  flag: false,
  entitlement: "free" as "free" | "ck_member" | "ck_premium",
  roles: [] as string[],
  native: false,
};
vi.mock("@/lib/flags", () => ({
  flags: {
    get nutrition_tracker_enabled() {
      return state.flag;
    },
  },
}));
vi.mock("@/lib/app", () => ({
  getContext: async () => ({ today: "2026-10-16", tz: "America/Vancouver" }),
}));
vi.mock("@/lib/viewer", () => ({
  getViewer: async () => ({
    viewer: { entitlement: state.entitlement, staffRoles: state.roles },
  }),
}));
vi.mock("@/lib/native", () => ({ isNativeApp: async () => state.native }));

const gate = async () => (await import("./nutrition")).nutritionGate();

describe("nutritionGate", () => {
  beforeEach(() => {
    vi.resetModules();
    notFound.mockClear();
    Object.assign(state, { flag: false, entitlement: "free", roles: [], native: false });
  });

  it("is invisible while the feature flag is off, even for paid members", async () => {
    state.entitlement = "ck_member";
    await expect(gate()).rejects.toThrow("NOT_FOUND");
  });
  it("lets owners and admins test it while the flag is off", async () => {
    state.roles = ["owner"];
    expect((await gate()).allowed).toBe(true);
    state.roles = ["coach"];
    await expect(gate()).rejects.toThrow("NOT_FOUND");
  });
  it("keeps free members out once the flag is on", async () => {
    state.flag = true;
    expect((await gate()).allowed).toBe(false);
  });
  it("lets paid members in once the flag is on", async () => {
    state.flag = true;
    state.entitlement = "ck_member";
    expect((await gate()).allowed).toBe(true);
    state.entitlement = "ck_premium";
    expect((await gate()).allowed).toBe(true);
  });
  it("tells pages when they run inside the store app", async () => {
    state.flag = true;
    state.native = true;
    expect((await gate()).native).toBe(true);
  });
});
