import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/secret-box", () => ({
  openSecret: (s: string | null) => (s === "sealed" ? "t".repeat(32) : null),
}));

const SID = `AC${"a".repeat(32)}`;
type Row = Record<string, unknown>;
const state = {
  settings: null as Row | null,
  missing: false,
  profile: { first_name: "Priya Kaur", phone: "604-555-0123" } as Row | null,
  sentToday: 0,
  claimFails: false,
  inserted: [] as Row[],
  updated: [] as Row[],
};

/** A tiny stand-in for the Supabase client: each table answers the way the code asks. */
function fakeDb() {
  return {
    from(table: string) {
      let op = "select";
      let payload: Row | null = null;
      const b: Record<string, unknown> = {};
      const chain = () => b;
      Object.assign(b, {
        select: chain,
        eq: chain,
        in: chain,
        gte: chain,
        order: chain,
        limit: chain,
        insert: (r: Row) => {
          op = "insert";
          payload = r;
          state.inserted.push(r);
          return b;
        },
        update: (r: Row) => {
          op = "update";
          payload = r;
          state.updated.push(r);
          return b;
        },
        maybeSingle: async () => {
          if (table === "sms_settings")
            return state.missing
              ? { data: null, error: { message: "relation does not exist" } }
              : { data: state.settings, error: null };
          return { data: state.profile, error: null };
        },
        single: async () =>
          state.claimFails
            ? { data: null, error: { code: "23505" } }
            : { data: { id: "m1" }, error: null },
        then: (res: (v: unknown) => void) =>
          res(
            op === "select"
              ? { count: state.sentToday, data: [], error: null }
              : { data: payload, error: null },
          ),
      });
      return b;
    },
  };
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => fakeDb() }));

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
vi.stubGlobal("fetch", fetchMock);

const { readyToSend, sendTestText, sendWelcomeText, twilioSend } = await import("./sms");

const on = (extra: Row = {}): Row => ({
  enabled: true,
  account_sid: SID,
  auth_token_enc: "sealed",
  auth_token_hint: "tttt",
  from_number: "+16045550000",
  messaging_service_sid: null,
  welcome_body: "Hi {{first_name}}!",
  allowed_country_codes: ["1"],
  daily_limit: 100,
  updated_at: null,
  ...extra,
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ sid: "SM1" }), { status: 201 }),
  );
  Object.assign(state, {
    settings: on(),
    missing: false,
    profile: { first_name: "Priya Kaur", phone: "604-555-0123" },
    sentToday: 0,
    claimFails: false,
    inserted: [],
    updated: [],
  });
});

describe("Twilio sending", () => {
  it("posts the text to Twilio with the account keys", async () => {
    const r = await twilioSend(
      { accountSid: SID, token: "x".repeat(32), from: "+16045550000", mg: null },
      "+17785550123",
      "Hello",
    );
    expect(r).toEqual({ ok: true, sid: "SM1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from(`${SID}:${"x".repeat(32)}`).toString("base64")}`,
    );
    const form = new URLSearchParams(String(init.body));
    expect(form.get("To")).toBe("+17785550123");
    expect(form.get("From")).toBe("+16045550000");
    expect(form.get("Body")).toBe("Hello");
  });

  it("uses the Messaging Service when there is one", async () => {
    await twilioSend(
      {
        accountSid: SID,
        token: "x".repeat(32),
        from: "+16045550000",
        mg: `MG${"b".repeat(32)}`,
      },
      "+17785550123",
      "Hi",
    );
    const form = new URLSearchParams(String(fetchMock.mock.calls[0]![1].body));
    expect(form.get("MessagingServiceSid")).toBe(`MG${"b".repeat(32)}`);
    expect(form.get("From")).toBeNull();
  });

  it("explains wrong keys and lost connections instead of throwing", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Authenticate", code: 20003 }), {
        status: 401,
      }),
    );
    const cfg = {
      accountSid: SID,
      token: "x".repeat(32),
      from: "+16045550000",
      mg: null,
    };
    expect(await twilioSend(cfg, "+17785550123", "Hi")).toEqual({
      ok: false,
      error: "Twilio refused the Account SID or Auth Token. (code 20003)",
    });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await twilioSend(cfg, "+17785550123", "Hi")).toEqual({
      ok: false,
      error: "Could not reach Twilio. Please try again.",
    });
  });

  it("says what is missing from the setup", () => {
    expect(readyToSend(null)).toEqual({ problem: "Add the Account SID." });
    expect(readyToSend(on({ auth_token_enc: null }) as never)).toEqual({
      problem: "Add the Auth Token.",
    });
    expect(readyToSend(on({ auth_token_enc: "v1:other-key" }) as never)).toMatchObject({
      problem: expect.stringMatching(/Type it again/),
    });
    expect(readyToSend(on({ from_number: null }) as never)).toEqual({
      problem: "Add a Twilio phone number or Messaging Service SID.",
    });
  });
});

describe("welcome text after sign-up", () => {
  it("texts a new member once, by first name, and logs only a masked number", async () => {
    await sendWelcomeText("u1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const form = new URLSearchParams(String(fetchMock.mock.calls[0]![1].body));
    expect(form.get("To")).toBe("+16045550123");
    expect(form.get("Body")).toBe("Hi Priya! Reply STOP to opt out.");
    expect(state.inserted[0]).toMatchObject({
      user_id: "u1",
      kind: "welcome",
      to_masked: "+1 ••• ••• 0123",
      status: "sending",
    });
    expect(JSON.stringify(state.inserted)).not.toContain("5550123");
    expect(state.updated[0]).toEqual({ status: "sent", provider_sid: "SM1" });
  });

  it("does nothing while texts are off or the setup is incomplete", async () => {
    state.settings = on({ enabled: false });
    await sendWelcomeText("u1");
    state.settings = on({ auth_token_enc: null });
    await sendWelcomeText("u1");
    state.missing = true;
    await sendWelcomeText("u1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.inserted).toEqual([]);
  });

  it("skips numbers it cannot read, other countries and the daily limit", async () => {
    state.profile = { first_name: "A", phone: "07407399413" };
    await sendWelcomeText("u1");
    state.profile = { first_name: "A", phone: "+447400123456" };
    await sendWelcomeText("u1");
    state.profile = { first_name: "A", phone: "6045550123" };
    state.sentToday = 100;
    await sendWelcomeText("u1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never texts twice: a second claim stops before Twilio", async () => {
    state.claimFails = true;
    await sendWelcomeText("u1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a failure and never throws", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Invalid To", code: 21211 }), {
        status: 400,
      }),
    );
    await expect(sendWelcomeText("u1")).resolves.toBeUndefined();
    expect(state.updated[0]).toEqual({
      status: "failed",
      error: "Invalid To (code 21211)",
    });
  });
});

describe("test text from Admin", () => {
  it("sends to the typed number and logs it", async () => {
    expect(await sendTestText("+1 778 555 0123")).toEqual({ ok: true });
    expect(state.inserted[0]).toMatchObject({ kind: "test", status: "sent" });
  });

  it("explains what is missing", async () => {
    expect(await sendTestText("call me")).toMatchObject({ ok: false });
    state.missing = true;
    expect(await sendTestText("+17785550123")).toEqual({
      ok: false,
      error: "Run SQL 0031 in Supabase first.",
    });
  });
});
