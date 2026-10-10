import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { A, B, addUser, asUser, freshDb } from "./harness";

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
  await addUser(db, A);
  await addUser(db, B);
});

const count = async (table: string) =>
  Number(
    (
      (await db.query(`select count(*)::int as n from public.${table}`)).rows[0] as {
        n: number;
      }
    ).n,
  );

describe("signup trigger", () => {
  it("creates a profile and default notification preferences", async () => {
    expect(await count("profiles")).toBe(2);
    expect(await count("notification_preferences")).toBe(2);
  });
});

describe("members only see their own rows", () => {
  const privateTables: [string, string, unknown[]][] = [
    [
      "weigh_ins",
      "insert into public.weigh_ins (user_id, log_date, weight_kg) values ($1, '2026-10-10', 67.2)",
      [A],
    ],
    [
      "habit_logs",
      "insert into public.habit_logs (user_id, log_date, habit_type, value) values ($1, '2026-10-10', 'water_ml', 250)",
      [A],
    ],
    [
      "body_measurements",
      "insert into public.body_measurements (user_id, log_date, waist_cm) values ($1, '2026-10-10', 74)",
      [A],
    ],
    [
      "weekly_checkins",
      "insert into public.weekly_checkins (user_id, week_start, energy) values ($1, '2026-10-05', 3)",
      [A],
    ],
    [
      "scheduled_actions",
      "insert into public.scheduled_actions (user_id, action_type, scheduled_for) values ($1, 'workout', '2026-10-10')",
      [A],
    ],
  ];

  for (const [table, sql, params] of privateTables) {
    it(`${table}: another member cannot read or write them`, async () => {
      await db.query(sql, params);
      const asB = await asUser(
        db,
        B,
        async () => (await db.query(`select * from public.${table}`)).rows.length,
      );
      expect(asB).toBe(0);
      await expect(
        asUser(db, B, () => db.query(sql, [A])), // B tries to insert a row owned by A
      ).rejects.toThrow();
      const asA = await asUser(
        db,
        A,
        async () => (await db.query(`select * from public.${table}`)).rows.length,
      );
      expect(asA).toBe(1);
    });
  }

  it("profiles and onboarding answers are private", async () => {
    await db.query(
      'insert into public.onboarding_profiles (user_id, height_cm, safety_flags) values ($1, 168, \'{"limitations":"knee"}\')',
      [A],
    );
    const rows = await asUser(
      db,
      B,
      async () =>
        (await db.query("select * from public.onboarding_profiles")).rows.length,
    );
    expect(rows).toBe(0);
    const profiles = await asUser(
      db,
      B,
      async () => (await db.query("select user_id from public.profiles")).rows,
    );
    expect(profiles).toEqual([{ user_id: B }]);
  });

  it("members cannot grant themselves a staff role", async () => {
    await expect(
      asUser(db, A, () =>
        db.query("insert into public.staff_roles (user_id, role) values ($1, 'owner')", [
          A,
        ]),
      ),
    ).rejects.toThrow();
  });

  it("members cannot write their own risk state", async () => {
    await expect(
      asUser(db, A, () =>
        db.query(
          "insert into public.risk_states (user_id, state) values ($1, 'active')",
          [A],
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("data rules", () => {
  it("allows one steps row per day but many water rows", async () => {
    await db.query(
      "insert into public.habit_logs (user_id, log_date, habit_type, value) values ($1,'2026-10-11','steps',1000)",
      [B],
    );
    await expect(
      db.query(
        "insert into public.habit_logs (user_id, log_date, habit_type, value) values ($1,'2026-10-11','steps',2000)",
        [B],
      ),
    ).rejects.toThrow();
    await db.query(
      "insert into public.habit_logs (user_id, log_date, habit_type, value) values ($1,'2026-10-11','water_ml',250),($1,'2026-10-11','water_ml',500)",
      [B],
    );
  });
  it("blocks two workouts on the same day", async () => {
    await db.query(
      "insert into public.scheduled_actions (user_id, action_type, scheduled_for) values ($1,'workout','2026-10-12')",
      [B],
    );
    await expect(
      db.query(
        "insert into public.scheduled_actions (user_id, action_type, scheduled_for) values ($1,'workout','2026-10-12')",
        [B],
      ),
    ).rejects.toThrow();
  });
  it("rejects impossible weights", async () => {
    await expect(
      db.query(
        "insert into public.weigh_ins (user_id, log_date, weight_kg) values ($1,'2026-10-13',5)",
        [B],
      ),
    ).rejects.toThrow();
  });
});

describe("programs, lessons and access", () => {
  const P_FREE = "10000000-0000-0000-0000-000000000001";
  const P_MEMBER = "10000000-0000-0000-0000-000000000002";
  const P_DRAFT = "10000000-0000-0000-0000-000000000003";
  const P_HIDDEN = "10000000-0000-0000-0000-000000000004";
  const S_FREE = "20000000-0000-0000-0000-000000000001";
  const S_MEMBER = "20000000-0000-0000-0000-000000000002";
  const L_FREE = "30000000-0000-0000-0000-000000000001";
  const L_MEMBER = "30000000-0000-0000-0000-000000000002";
  const L_MIXED = "30000000-0000-0000-0000-000000000003";
  const C = "00000000-0000-0000-0000-00000000000c"; // free member
  const D = "00000000-0000-0000-0000-00000000000d"; // paying member
  const E = "00000000-0000-0000-0000-00000000000e"; // content manager

  beforeAll(async () => {
    for (const u of [C, D, E]) await addUser(db, u);
    await db.query(
      "insert into public.staff_roles (user_id, role) values ($1,'content_manager')",
      [E],
    );
    await db.query(
      "insert into public.memberships (user_id, status, period_end) values ($1,'active', now() + interval '20 days')",
      [D],
    );
    await db.exec(`
      insert into public.programs (id, slug, title, access_level, published) values
        ('${P_FREE}','free-p','Free program','free',true),
        ('${P_MEMBER}','member-p','Member program','member',true),
        ('${P_DRAFT}','draft-p','Draft program','free',false),
        ('${P_HIDDEN}','hidden-p','Hidden program','hidden',true);
      insert into public.program_sections (id, program_id, title) values
        ('${S_FREE}','${P_FREE}','Week 1'), ('${S_MEMBER}','${P_MEMBER}','Week 1');
      insert into public.lessons (id, section_id, title, instructions, stream_uid, access_override) values
        ('${L_FREE}','${S_FREE}','Free lesson','open text','uid-free',null),
        ('${L_MEMBER}','${S_MEMBER}','Member lesson','paid text','uid-paid',null),
        ('${L_MIXED}','${S_FREE}','Free program, member lesson','paid text','uid-mixed','member');
    `);
  });

  const titles = (rows: unknown[]) =>
    (rows as { title: string }[]).map((r) => r.title).sort();

  it("lists published programs to everyone but hides drafts and hidden ones", async () => {
    const rows = await asUser(
      db,
      C,
      async () => (await db.query("select title from public.programs")).rows,
    );
    expect(titles(rows)).toEqual(["Free program", "Member program"]);
  });

  it("gives free members only free lesson content, never paid text or video IDs", async () => {
    const rows = await asUser(
      db,
      C,
      async () => (await db.query("select title, stream_uid from public.lessons")).rows,
    );
    expect(titles(rows)).toEqual(["Free lesson"]);
  });

  it("lets the outline show locked lessons without their content", async () => {
    const rows = await asUser(
      db,
      C,
      async () => (await db.query("select * from public.lesson_outline")).rows,
    );
    expect(rows).toHaveLength(3);
    expect(Object.keys(rows[0] as object)).not.toContain("stream_uid");
    expect(Object.keys(rows[0] as object)).not.toContain("instructions");
  });

  it("unlocks member content for an active membership, including per-lesson overrides", async () => {
    const rows = await asUser(
      db,
      D,
      async () => (await db.query("select title from public.lessons")).rows,
    );
    expect(titles(rows)).toEqual([
      "Free lesson",
      "Free program, member lesson",
      "Member lesson",
    ]);
  });

  it("removes access when the membership expires", async () => {
    await db.query(
      "update public.memberships set period_end = now() - interval '1 day' where user_id = $1",
      [D],
    );
    const rows = await asUser(
      db,
      D,
      async () => (await db.query("select title from public.lessons")).rows,
    );
    expect(titles(rows)).toEqual(["Free lesson"]);
  });

  it("keeps access for a cancelled member until the paid period ends", async () => {
    await db.query(
      "update public.memberships set status='canceled', period_end = now() + interval '5 days' where user_id = $1",
      [D],
    );
    expect(
      await asUser(
        db,
        D,
        async () => (await db.query("select current_entitlement() as e")).rows[0],
      ),
    ).toEqual({ e: "ck_member" });
  });

  it("gives a 7 day grace window for billing problems, then stops", async () => {
    await db.query(
      "update public.memberships set status='past_due', period_end = now() - interval '3 days' where user_id = $1",
      [D],
    );
    expect(
      await asUser(
        db,
        D,
        async () => (await db.query("select current_entitlement() as e")).rows[0],
      ),
    ).toEqual({ e: "ck_member" });
    await db.query(
      "update public.memberships set period_end = now() - interval '10 days' where user_id = $1",
      [D],
    );
    expect(
      await asUser(
        db,
        D,
        async () => (await db.query("select current_entitlement() as e")).rows[0],
      ),
    ).toEqual({ e: "free" });
  });

  it("blocks a free member from recording progress or enrolling in paid content", async () => {
    await expect(
      asUser(db, C, () =>
        db.query(
          "insert into public.lesson_progress (user_id, lesson_id) values ($1,$2)",
          [C, L_MEMBER],
        ),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(db, C, () =>
        db.query(
          "insert into public.program_enrollments (user_id, program_id) values ($1,$2)",
          [C, P_MEMBER],
        ),
      ),
    ).rejects.toThrow();
    await asUser(db, C, () =>
      db.query(
        "insert into public.program_enrollments (user_id, program_id) values ($1,$2)",
        [C, P_FREE],
      ),
    );
  });

  it("stops members editing content or memberships, but lets content managers edit content", async () => {
    await expect(
      asUser(db, C, () => db.query("update public.programs set title = 'hacked'")),
    ).resolves.toBeDefined();
    const still = await db.query(
      "select count(*)::int as n from public.programs where title = 'hacked'",
    );
    expect((still.rows[0] as { n: number }).n).toBe(0); // update matched no rows under RLS
    await expect(
      asUser(db, C, () =>
        db.query("insert into public.memberships (user_id) values ($1)", [A]),
      ),
    ).rejects.toThrow();
    await asUser(db, E, () =>
      db.query("update public.programs set title = 'Free program' where id = $1", [
        P_FREE,
      ]),
    );
    const drafts = await asUser(
      db,
      E,
      async () => (await db.query("select title from public.programs")).rows,
    );
    expect(titles(drafts)).toHaveLength(4);
  });
});

describe("development seed", () => {
  it("loads cleanly on top of the migrations", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fresh = await freshDb();
    await fresh.exec(readFileSync(join(__dirname, "..", "seed.sql"), "utf8"));
    const n = (await fresh.query("select count(*)::int as n from public.lessons"))
      .rows[0] as { n: number };
    expect(n.n).toBe(5);
    const tags = (
      await fresh.query("select count(*)::int as n from public.program_tag_map")
    ).rows[0] as { n: number };
    expect(tags.n).toBe(11);
  });
});

describe("operations tables", () => {
  const F = "00000000-0000-0000-0000-00000000000f";
  const G = "00000000-0000-0000-0000-000000000010"; // support staff
  beforeAll(async () => {
    await addUser(db, F);
    await addUser(db, G);
    await db.query(
      "insert into public.staff_roles (user_id, role) values ($1,'support')",
      [G],
    );
    await db.query(
      "insert into public.notifications (user_id, kind, title) values ($1,'billing','Payment problem')",
      [F],
    );
    await db.query(
      "insert into public.crm_sync_events (user_id, event_type) values ($1,'membership_started')",
      [F],
    );
    await db.query(
      "insert into public.analytics_events (user_id, event_name) values ($1,'signup')",
      [F],
    );
    await db.query(
      "insert into public.weigh_ins (user_id, log_date, weight_kg) values ($1,'2026-10-10',70)",
      [F],
    );
  });

  it("lets a member read and mark her own notifications but not create or read others", async () => {
    expect(
      await asUser(
        db,
        F,
        async () => (await db.query("select * from public.notifications")).rows.length,
      ),
    ).toBe(1);
    expect(
      await asUser(
        db,
        B,
        async () => (await db.query("select * from public.notifications")).rows.length,
      ),
    ).toBe(0);
    await expect(
      asUser(db, F, () =>
        db.query(
          "insert into public.notifications (user_id, kind, title) values ($1,'x','spam')",
          [F],
        ),
      ),
    ).rejects.toThrow();
    await asUser(db, F, () =>
      db.query("update public.notifications set read_at = now()"),
    );
  });

  it("keeps the CRM queue and analytics invisible to members", async () => {
    expect(
      await asUser(
        db,
        F,
        async () => (await db.query("select * from public.crm_sync_events")).rows.length,
      ),
    ).toBe(0);
    expect(
      await asUser(
        db,
        F,
        async () => (await db.query("select * from public.analytics_events")).rows.length,
      ),
    ).toBe(0);
  });

  it("lets members create their own support request only", async () => {
    await asUser(db, F, () =>
      db.query(
        "insert into public.support_requests (user_id, message) values ($1,'Please help')",
        [F],
      ),
    );
    await expect(
      asUser(db, F, () =>
        db.query(
          "insert into public.support_requests (user_id, message) values ($1,'as someone else')",
          [B],
        ),
      ),
    ).rejects.toThrow();
    expect(
      await asUser(
        db,
        B,
        async () => (await db.query("select * from public.support_requests")).rows.length,
      ),
    ).toBe(0);
  });

  it("lets support staff see requests but not body data", async () => {
    expect(
      await asUser(
        db,
        G,
        async () => (await db.query("select * from public.support_requests")).rows.length,
      ),
    ).toBe(1);
    expect(
      await asUser(
        db,
        G,
        async () => (await db.query("select * from public.weigh_ins")).rows.length,
      ),
    ).toBe(0);
    expect(
      await asUser(
        db,
        G,
        async () =>
          (await db.query("select * from public.onboarding_profiles")).rows.length,
      ),
    ).toBe(0);
  });
});

describe("admin support migration", () => {
  it("copies the email onto the profile at signup and when it changes", async () => {
    const H = "00000000-0000-0000-0000-000000000011";
    await addUser(db, H, "hh@example.com");
    expect(
      (
        (await db.query("select email from public.profiles where user_id = $1", [H]))
          .rows[0] as { email: string }
      ).email,
    ).toBe("hh@example.com");
    await db.query("update auth.users set email = 'new@example.com' where id = $1", [H]);
    expect(
      (
        (await db.query("select email from public.profiles where user_id = $1", [H]))
          .rows[0] as { email: string }
      ).email,
    ).toBe("new@example.com");
  });
  it("de-duplicates keyed notifications", async () => {
    await db.query(
      "insert into public.notifications (user_id, kind, title, dedupe_key) values ($1,'workout','Time to train','workout:2026-10-14')",
      [A],
    );
    await expect(
      db.query(
        "insert into public.notifications (user_id, kind, title, dedupe_key) values ($1,'workout','Time to train','workout:2026-10-14')",
        [A],
      ),
    ).rejects.toThrow();
  });
});

describe("daily check-in migration", () => {
  const J = "00000000-0000-0000-0000-000000000012";
  beforeAll(async () => addUser(db, J));
  const row =
    "insert into public.daily_checkins (user_id, check_date, energy, soreness, sleep, mood) values ($1,'2026-10-10','good','mild','fair','okay')";

  it("stores one check-in per member per day, privately", async () => {
    await asUser(db, J, () => db.query(row, [J]));
    await expect(asUser(db, J, () => db.query(row, [J]))).rejects.toThrow(); // second one the same day
    expect(
      await asUser(
        db,
        A,
        async () => (await db.query("select * from public.daily_checkins")).rows.length,
      ),
    ).toBe(0);
    await expect(asUser(db, A, () => db.query(row, [J]))).rejects.toThrow(); // cannot write for someone else
  });
  it("rejects values outside the allowed answers", async () => {
    await expect(
      db.query(
        "insert into public.daily_checkins (user_id, check_date, energy, soreness, sleep, mood) values ($1,'2026-10-11','amazing','mild','fair','okay')",
        [J],
      ),
    ).rejects.toThrow();
  });
  it("saves a barrier reason on a missed workout, and rejects unknown reasons", async () => {
    await db.query(
      "insert into public.scheduled_actions (user_id, action_type, scheduled_for, status, barrier) values ($1,'workout','2026-10-20','skipped','no_time')",
      [J],
    );
    await expect(
      db.query(
        "insert into public.scheduled_actions (user_id, action_type, scheduled_for, barrier) values ($1,'workout','2026-10-21','boredom')",
        [J],
      ),
    ).rejects.toThrow();
  });
});
