import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const reply = (content: string) =>
  Promise.resolve(
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
    }),
  );

describe("analyzeMeal", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_NUTRITION_MODEL;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("does nothing without a server key", async () => {
    delete process.env.OPENAI_API_KEY;
    const { analyzeMeal } = await import("./nutrition-ai");
    expect(await analyzeMeal({ description: "dal" })).toEqual({
      ok: false,
      error: "unavailable",
    });
  });

  it("returns validated items and uses the configured model", async () => {
    process.env.OPENAI_NUTRITION_MODEL = "my-model";
    const fetchMock = vi.fn(() =>
      reply(
        '```json\n{"items":[{"name":"Dal","estimated_calories":220,"estimated_protein_g":13,"estimated_carbs_g":30,"estimated_fat_g":6}],"notes":["Oil unknown"]}\n```',
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { analyzeMeal } = await import("./nutrition-ai");
    const r = await analyzeMeal({
      imageBase64: "AAAA",
      description: "dal",
      mealType: "lunch",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.model).toBe("my-model");
      expect(r.value.totals.calories).toBe(220);
    }
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    );
    expect(body.model).toBe("my-model");
    expect(JSON.stringify(body)).toContain("data:image/jpeg;base64,AAAA");
    expect(JSON.stringify(body)).not.toContain("test-key");
  });

  it("never returns a broken result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => reply("sorry, I cannot help")),
    );
    const { analyzeMeal } = await import("./nutrition-ai");
    expect(await analyzeMeal({ description: "x" })).toEqual({
      ok: false,
      error: "unreadable",
    });
  });

  it("fails gently when the service is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("no", { status: 500 }))),
    );
    const { analyzeMeal } = await import("./nutrition-ai");
    expect(await analyzeMeal({ description: "x" })).toEqual({
      ok: false,
      error: "failed",
    });
  });
});
