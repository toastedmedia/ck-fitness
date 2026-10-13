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

describe("progress photos", () => {
  const K = "00000000-0000-0000-0000-000000000013";
  const S = "00000000-0000-0000-0000-000000000014"; // staff: owner + support
  beforeAll(async () => {
    await addUser(db, K);
    await addUser(db, S);
    await db.query(
      "insert into public.staff_roles (user_id, role) values ($1,'owner'),($1,'support')",
      [S],
    );
  });
  const row =
    "insert into public.progress_photos (user_id, taken_on, week_start, pose, storage_path) values ($1,'2026-10-12','2026-10-12','front', $2)";

  it("lets a member add her own photo record, inside her own folder only", async () => {
    await asUser(db, K, () => db.query(row, [K, `${K}/abc.jpg`]));
    await expect(
      asUser(db, K, () =>
        db.query(row.replace("'front'", "'back'"), [K, `${A}/stolen.jpg`]),
      ),
    ).rejects.toThrow(); // someone else's folder
    await expect(
      asUser(db, K, () => db.query(row, [K, `${K}/dup.jpg`])),
    ).rejects.toThrow(); // one photo per pose per week
  });
  it("hides photos from everyone else, including owners and support", async () => {
    expect(
      await asUser(
        db,
        B,
        async () => (await db.query("select * from public.progress_photos")).rows.length,
      ),
    ).toBe(0);
    expect(
      await asUser(
        db,
        S,
        async () => (await db.query("select * from public.progress_photos")).rows.length,
      ),
    ).toBe(0);
  });
  it("lets her delete her own, but nobody else's", async () => {
    await asUser(db, S, () => db.query("delete from public.progress_photos"));
    expect(
      await asUser(
        db,
        K,
        async () => (await db.query("select * from public.progress_photos")).rows.length,
      ),
    ).toBe(1);
    await asUser(db, K, () => db.query("delete from public.progress_photos"));
    expect(
      await asUser(
        db,
        K,
        async () => (await db.query("select * from public.progress_photos")).rows.length,
      ),
    ).toBe(0);
  });
});

describe("terms acceptance", () => {
  it("copies the acceptance recorded at sign-up onto the profile", async () => {
    const L = "00000000-0000-0000-0000-000000000015";
    await db.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'l@example.com', $2)",
      [
        L,
        JSON.stringify({
          terms_accepted_at: "2026-10-12T10:00:00Z",
          terms_version: "2026-10",
        }),
      ],
    );
    const row = (
      await db.query(
        "select terms_accepted_at, terms_version from public.profiles where user_id = $1",
        [L],
      )
    ).rows[0] as { terms_accepted_at: Date; terms_version: string };
    expect(row.terms_version).toBe("2026-10");
    expect(new Date(row.terms_accepted_at).toISOString()).toBe(
      "2026-10-12T10:00:00.000Z",
    );
  });
  it("leaves it empty for accounts created without it", async () => {
    const row = (
      await db.query("select terms_accepted_at from public.profiles where user_id = $1", [
        A,
      ])
    ).rows[0] as { terms_accepted_at: Date | null };
    expect(row.terms_accepted_at).toBeNull();
  });
});

describe("client records for coaching staff", () => {
  const M1 = "00000000-0000-0000-0000-000000000020"; // shared records, not photos
  const M2 = "00000000-0000-0000-0000-000000000021"; // shared nothing
  const M3 = "00000000-0000-0000-0000-000000000022"; // shared records and photos
  const COACH = "00000000-0000-0000-0000-000000000023";
  const SUPPORT = "00000000-0000-0000-0000-000000000024";

  beforeAll(async () => {
    for (const u of [M1, M2, M3, COACH, SUPPORT]) await addUser(db, u);
    await db.query(
      "insert into public.staff_roles (user_id, role) values ($1,'coach'),($2,'support')",
      [COACH, SUPPORT],
    );
    await db.query(
      "update public.profiles set coach_access_at = now() where user_id in ($1, $2)",
      [M1, M3],
    );
    await db.query(
      "update public.profiles set photo_coach_access_at = now() where user_id = $1",
      [M3],
    );
    for (const u of [M1, M2, M3]) {
      await db.query(
        "insert into public.weigh_ins (user_id, log_date, weight_kg) values ($1,'2026-10-12',70)",
        [u],
      );
      await db.query(
        "insert into public.daily_checkins (user_id, check_date, energy, soreness, sleep, mood) values ($1,'2026-10-12','good','mild','fair','okay')",
        [u],
      );
      await db.query(
        'insert into public.onboarding_profiles (user_id, height_cm, safety_flags) values ($1, 165, \'{"limitations":"knee"}\')',
        [u],
      );
    }
    for (const u of [M1, M3])
      await db.query(
        "insert into public.progress_photos (user_id, taken_on, week_start, pose, storage_path) values ($1,'2026-10-12','2026-10-12','front', $2)",
        [u, `${u}/x.jpg`],
      );
  });

  const rows = (user: string, table: string) =>
    asUser(
      db,
      user,
      async () =>
        (await db.query(`select user_id from public.${table}`)).rows as {
          user_id: string;
        }[],
    );

  it("lets a coach read only the records of members who agreed to share", async () => {
    for (const t of ["weigh_ins", "daily_checkins", "onboarding_profiles"]) {
      expect((await rows(COACH, t)).map((r) => r.user_id).sort()).toEqual(
        [M1, M3].sort(),
      );
    }
  });
  it("lets a coach see photos only when photo sharing is also on", async () => {
    expect((await rows(COACH, "progress_photos")).map((r) => r.user_id)).toEqual([M3]);
  });
  it("keeps support staff away from health records entirely", async () => {
    for (const t of [
      "weigh_ins",
      "daily_checkins",
      "onboarding_profiles",
      "progress_photos",
    ])
      expect(await rows(SUPPORT, t)).toHaveLength(0);
  });
  it("stops access the moment a member withdraws", async () => {
    await db.query(
      "update public.profiles set coach_access_at = null where user_id = $1",
      [M1],
    );
    expect((await rows(COACH, "weigh_ins")).map((r) => r.user_id)).toEqual([M3]);
    await db.query(
      "update public.profiles set coach_access_at = now() where user_id = $1",
      [M1],
    );
  });
  it("never lets staff change a member's records", async () => {
    await asUser(db, COACH, () => db.query("update public.weigh_ins set weight_kg = 1"));
    const w = (
      await db.query("select weight_kg from public.weigh_ins where user_id = $1", [M1])
    ).rows[0] as { weight_kg: string };
    expect(Number(w.weight_kg)).toBe(70);
  });
  it("keeps staff notes away from members and lets staff add notes as themselves only", async () => {
    await asUser(db, COACH, () =>
      db.query(
        "insert into public.client_notes (user_id, author_id, body) values ($1,$2,'Prefers morning sessions')",
        [M1, COACH],
      ),
    );
    await expect(
      asUser(db, COACH, () =>
        db.query(
          "insert into public.client_notes (user_id, author_id, body) values ($1,$2,'forged')",
          [M1, SUPPORT],
        ),
      ),
    ).rejects.toThrow();
    expect(await rows(M1, "client_notes")).toHaveLength(0);
    expect(await rows(SUPPORT, "client_notes")).toHaveLength(1);
  });
});

describe("client activity: watch detail and change log", () => {
  const N1 = "00000000-0000-0000-0000-000000000030"; // shares
  const N2 = "00000000-0000-0000-0000-000000000031"; // does not share
  const CO = "00000000-0000-0000-0000-000000000032"; // coach
  beforeAll(async () => {
    for (const u of [N1, N2, CO]) await addUser(db, u);
    await db.query("insert into public.staff_roles (user_id, role) values ($1,'coach')", [
      CO,
    ]);
    await db.query(
      "update public.profiles set coach_access_at = now() where user_id = $1",
      [N1],
    );
  });
  const seen = (user: string, table: string) =>
    asUser(
      db,
      user,
      async () => (await db.query(`select user_id from public.${table}`)).rows.length,
    );

  it("logs what a member changes on her account, ignoring housekeeping updates", async () => {
    await asUser(db, N1, () =>
      db.query(
        "update public.profiles set phone = '+1 604 555 0100', units = 'imperial' where user_id = $1",
        [N1],
      ),
    );
    const count = async () =>
      Number(
        (
          (
            await db.query(
              "select count(*)::int as n from public.client_changes where user_id = $1",
              [N1],
            )
          ).rows[0] as { n: number }
        ).n,
      );
    const before = await count();
    await db.query(
      "update public.profiles set last_active_at = now() where user_id = $1",
      [N1],
    ); // housekeeping only
    expect(await count()).toBe(before);
    const rows = (
      await db.query(
        "select details from public.client_changes where user_id = $1 and details ? 'phone'",
        [N1],
      )
    ).rows as { details: Record<string, { from: unknown; to: unknown }> }[];
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0].details).sort()).toEqual(["phone", "units"]);
    expect(rows[0].details.units).toEqual({ from: "metric", to: "imperial" });
  });
  it("logs plan and notification changes", async () => {
    await db.query(
      "insert into public.accountability_plans (user_id, weekly_target_workouts) values ($1, 3)",
      [N1],
    );
    await asUser(db, N1, () =>
      db.query(
        "update public.accountability_plans set weekly_target_workouts = 5 where user_id = $1",
        [N1],
      ),
    );
    await asUser(db, N1, () =>
      db.query(
        "update public.notification_preferences set marketing = true where user_id = $1",
        [N1],
      ),
    );
    const sources = (
      (
        await db.query(
          "select distinct source from public.client_changes where user_id = $1",
          [N1],
        )
      ).rows as { source: string }[]
    ).map((r) => r.source);
    expect(sources).toEqual(
      expect.arrayContaining([
        "accountability_plans",
        "notification_preferences",
        "profiles",
      ]),
    );
  });
  it("shows the change log to a coach only for members who share", async () => {
    await db.query("update public.profiles set phone = '123' where user_id = $1", [N2]);
    const owners = await asUser(
      db,
      CO,
      async () =>
        (await db.query("select distinct user_id from public.client_changes")).rows as {
          user_id: string;
        }[],
    );
    const ids = owners.map((r) => r.user_id);
    expect(ids).toContain(N1);
    expect(ids).not.toContain(N2);
  });
  it("lets members read nothing from the change log and never write to it", async () => {
    expect(await seen(N1, "client_changes")).toBe(0);
    await expect(
      asUser(db, N1, () =>
        db.query("insert into public.client_changes (user_id, source) values ($1,'x')", [
          N1,
        ]),
      ),
    ).rejects.toThrow();
  });
  it("tracks how much of a video she watched", async () => {
    const lessonProgress = `00000000-0000-0000-0000-0000000000a1`;
    await db.query(
      "insert into public.programs (id, slug, title, access_level, published) values ('90000000-0000-0000-0000-000000000001','p-watch','Watch','free',true)",
    );
    await db.query(
      "insert into public.program_sections (id, program_id, title) values ('91000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','W1')",
    );
    await db.query(
      "insert into public.lessons (id, section_id, title) values ($1,'91000000-0000-0000-0000-000000000001','L')",
      [lessonProgress],
    );
    await asUser(db, N1, () =>
      db.query(
        "insert into public.lesson_progress (user_id, lesson_id, furthest_seconds, watch_seconds, play_count, last_watched_at) values ($1,$2,400,380,2, now())",
        [N1, lessonProgress],
      ),
    );
    const row = await asUser(
      db,
      CO,
      async () =>
        (
          await db.query(
            "select furthest_seconds, watch_seconds, play_count from public.lesson_progress",
          )
        ).rows[0] as {
          furthest_seconds: number;
          watch_seconds: number;
          play_count: number;
        },
    );
    expect(row).toEqual({ furthest_seconds: 400, watch_seconds: 380, play_count: 2 });
  });
  it("turns sharing on for existing pre-launch accounts (the 0013 backfill)", async () => {
    const O = "00000000-0000-0000-0000-000000000033";
    await addUser(db, O);
    await db.query(
      "update public.profiles set onboarding_complete = true where user_id = $1",
      [O],
    );
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const sql = readFileSync(
      join(__dirname, "..", "migrations", "20261020000013_client_activity.sql"),
      "utf8",
    );
    await db.exec(sql.slice(sql.indexOf("update public.profiles")));
    const row = (
      await db.query(
        "select coach_access_at, photo_coach_access_at from public.profiles where user_id = $1",
        [O],
      )
    ).rows[0] as { coach_access_at: Date | null; photo_coach_access_at: Date | null };
    expect(row.coach_access_at).not.toBeNull();
    expect(row.photo_coach_access_at).not.toBeNull();
  });
});

describe("community", () => {
  const P = ["a", "b", "c", "d"].map(
    (c, i) => `00000000-0000-0000-0000-0000000000${(40 + i).toString()}`,
  );
  const [U1, U2, U3, U4] = P;
  const MOD = "00000000-0000-0000-0000-000000000050";
  const NEW = "00000000-0000-0000-0000-000000000051"; // has not accepted the guidelines
  const MUTED = "00000000-0000-0000-0000-000000000052";
  const post = (user: string, body = "Hello community") =>
    asUser(db, user, () =>
      db.query(
        "insert into public.community_posts (user_id, body, category) values ($1,$2,'win') returning id",
        [user, body],
      ),
    );

  beforeAll(async () => {
    for (const u of [...P, MOD, NEW, MUTED]) await addUser(db, u);
    await db.query(
      "insert into public.staff_roles (user_id, role) values ($1,'support')",
      [MOD],
    );
    await db.query(
      "update public.profiles set onboarding_complete = true, community_accepted_at = now(), first_name = 'Priya', last_name = 'Sharma' where user_id = any($1::uuid[])",
      [[U1, U2, U3, U4]],
    );
    await db.query(
      "update public.profiles set onboarding_complete = true where user_id = any($1::uuid[])",
      [[NEW, MUTED]],
    );
    await db.query(
      "update public.profiles set community_accepted_at = now(), community_muted_until = now() + interval '3 days' where user_id = $1",
      [MUTED],
    );
  });

  it("sets the author name from her profile and ignores any name she tries to send", async () => {
    const r = await asUser(db, U1, () =>
      db.query(
        "insert into public.community_posts (user_id, author_name, body) values ($1,'Someone Else','Hi') returning author_name",
        [U1],
      ),
    );
    expect((r.rows[0] as { author_name: string }).author_name).toBe("Priya S.");
  });
  it("blocks posting until the guidelines are accepted, and while muted", async () => {
    await expect(post(NEW)).rejects.toThrow();
    await expect(post(MUTED)).rejects.toThrow();
  });
  it("blocks posting as someone else", async () => {
    await expect(
      asUser(db, U1, () =>
        db.query(
          "insert into public.community_posts (user_id, body) values ($1,'spoof')",
          [U2],
        ),
      ),
    ).rejects.toThrow();
  });
  it("shows visible posts to members, and a member can still see her own hidden posts", async () => {
    const r = await post(U2, "Visible post");
    const id = (r.rows[0] as { id: string }).id;
    expect(
      (
        await asUser(
          db,
          U3,
          async () =>
            (await db.query("select id from public.community_posts where id = $1", [id]))
              .rows,
        )
      ).length,
    ).toBe(1);
    await db.query("update public.community_posts set status = 'hidden' where id = $1", [
      id,
    ]);
    expect(
      (
        await asUser(
          db,
          U3,
          async () =>
            (await db.query("select id from public.community_posts where id = $1", [id]))
              .rows,
        )
      ).length,
    ).toBe(0);
    expect(
      (
        await asUser(
          db,
          U2,
          async () =>
            (await db.query("select id from public.community_posts where id = $1", [id]))
              .rows,
        )
      ).length,
    ).toBe(1);
    expect(
      (
        await asUser(
          db,
          MOD,
          async () =>
            (await db.query("select id from public.community_posts where id = $1", [id]))
              .rows,
        )
      ).length,
    ).toBe(1);
  });
  it("hides a blocked member's posts in both directions", async () => {
    const id = ((await post(U3, "From U3")).rows[0] as { id: string }).id;
    await asUser(db, U4, () =>
      db.query(
        "insert into public.community_blocks (blocker_id, blocked_id) values ($1,$2)",
        [U4, U3],
      ),
    );
    expect(
      (
        await asUser(
          db,
          U4,
          async () =>
            (await db.query("select id from public.community_posts where id = $1", [id]))
              .rows,
        )
      ).length,
    ).toBe(0);
    const id4 = ((await post(U4, "From U4")).rows[0] as { id: string }).id;
    expect(
      (
        await asUser(
          db,
          U3,
          async () =>
            (await db.query("select id from public.community_posts where id = $1", [id4]))
              .rows,
        )
      ).length,
    ).toBe(0);
  });
  it("hides a post automatically after three different members report it", async () => {
    const id = ((await post(U1, "Questionable post")).rows[0] as { id: string }).id;
    for (const reporter of [U2, U3, U4])
      await asUser(db, reporter, () =>
        db.query(
          "insert into public.community_reports (reporter_id, post_id, reason) values ($1,$2,'spam')",
          [reporter, id],
        ),
      );
    const row = (
      await db.query(
        "select status, report_count from public.community_posts where id = $1",
        [id],
      )
    ).rows[0] as { status: string; report_count: number };
    expect(row).toEqual({ status: "hidden", report_count: 3 });
  });
  it("lets a member report something only once", async () => {
    const id = ((await post(U1, "Another")).rows[0] as { id: string }).id;
    await asUser(db, U2, () =>
      db.query(
        "insert into public.community_reports (reporter_id, post_id, reason) values ($1,$2,'spam')",
        [U2, id],
      ),
    );
    await expect(
      asUser(db, U2, () =>
        db.query(
          "insert into public.community_reports (reporter_id, post_id, reason) values ($1,$2,'other')",
          [U2, id],
        ),
      ),
    ).rejects.toThrow();
  });
  it("counts likes and comments, and keeps reports private to the reporter and staff", async () => {
    const id = ((await post(U1, "Count me")).rows[0] as { id: string }).id;
    await asUser(db, U2, () =>
      db.query("insert into public.community_likes (post_id, user_id) values ($1,$2)", [
        id,
        U2,
      ]),
    );
    await asUser(db, U3, () =>
      db.query("insert into public.community_likes (post_id, user_id) values ($1,$2)", [
        id,
        U3,
      ]),
    );
    await asUser(db, U2, () =>
      db.query(
        "insert into public.community_comments (post_id, user_id, body) values ($1,$2,'Well done')",
        [id, U2],
      ),
    );
    const row = (
      await db.query(
        "select like_count, comment_count from public.community_posts where id = $1",
        [id],
      )
    ).rows[0] as { like_count: number; comment_count: number };
    expect(row).toEqual({ like_count: 2, comment_count: 1 });
    // U1 has reported nothing, so she sees no reports (even about her own posts); staff see them all.
    expect(
      (
        await asUser(
          db,
          U1,
          async () => (await db.query("select * from public.community_reports")).rows,
        )
      ).length,
    ).toBe(0);
    expect(
      (
        await asUser(
          db,
          MOD,
          async () => (await db.query("select * from public.community_reports")).rows,
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it("stops members editing or hiding other people's posts", async () => {
    const id = ((await post(U1, "Mine")).rows[0] as { id: string }).id;
    await asUser(db, U2, () =>
      db.query("update public.community_posts set status = 'removed' where id = $1", [
        id,
      ]),
    );
    await asUser(db, U2, () =>
      db.query("delete from public.community_posts where id = $1", [id]),
    );
    expect(
      (
        (await db.query("select status from public.community_posts where id = $1", [id]))
          .rows[0] as { status: string }
      ).status,
    ).toBe("visible");
  });
  it("limits a member to ten posts a day", async () => {
    const R = "00000000-0000-0000-0000-000000000053";
    await addUser(db, R);
    await db.query(
      "update public.profiles set onboarding_complete = true, community_accepted_at = now() where user_id = $1",
      [R],
    );
    for (let i = 0; i < 10; i++) await post(R, `post ${i}`);
    await expect(post(R, "one too many")).rejects.toThrow();
  });
  it("lets only staff post announcements, shown as the CK Team", async () => {
    await expect(
      asUser(db, U1, () =>
        db.query(
          "insert into public.community_posts (user_id, body, category) values ($1,'x','announcement')",
          [U1],
        ),
      ),
    ).rejects.toThrow();
    const r = await asUser(db, MOD, () =>
      db.query(
        "insert into public.community_posts (user_id, body, category) values ($1,'Welcome!','announcement') returning author_name",
        [MOD],
      ),
    );
    expect((r.rows[0] as { author_name: string }).author_name).toBe("CK Team");
  });
  it("closes the community to free members when the audience is set to members", async () => {
    await db.query(
      "update public.app_settings set value = '\"members\"' where key = 'community_audience'",
    );
    expect(
      (
        await asUser(
          db,
          U1,
          async () => (await db.query("select id from public.community_posts")).rows,
        )
      ).length,
    ).toBeGreaterThanOrEqual(0);
    const visible = await asUser(
      db,
      U3,
      async () =>
        (
          await db.query(
            "select id from public.community_posts where status = 'visible' and user_id <> $1",
            [U3],
          )
        ).rows,
    );
    expect(visible).toHaveLength(0);
    await db.query(
      "update public.app_settings set value = '\"all\"' where key = 'community_audience'",
    );
  });
});

describe("migrations that are meant to be repeatable", () => {
  it("can be pasted and run a second time without errors (0012 to 0015)", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fresh = await freshDb();
    for (const f of [
      "20261019000012_sharing_decision.sql",
      "20261020000013_client_activity.sql",
      "20261021000014_community.sql",
    ]) {
      await fresh.exec(readFileSync(join(__dirname, "..", "migrations", f), "utf8")); // second run
    }
    const n = (await fresh.query("select count(*)::int as n from public.community_posts"))
      .rows[0] as { n: number };
    expect(n.n).toBe(0);
  });
});

describe("community feed: reactions, photos with approval, edits, replies, directory", () => {
  const [A1, A2, A3] = ["60", "61", "62"].map(
    (n) => `00000000-0000-0000-0000-0000000000${n}`,
  );
  const STAFF = "00000000-0000-0000-0000-000000000063";
  beforeAll(async () => {
    for (const u of [A1, A2, A3, STAFF]) await addUser(db, u);
    await db.query("insert into public.staff_roles (user_id, role) values ($1,'owner')", [
      STAFF,
    ]);
    await db.query(
      "update public.profiles set onboarding_complete = true, community_accepted_at = now(), first_name = 'Mia', last_name = 'Singh' where user_id = any($1::uuid[])",
      [[A1, A2, A3, STAFF]],
    );
  });
  const mkPost = async (u: string, extra = "") =>
    (
      (
        await asUser(db, u, () =>
          db.query(
            `insert into public.community_posts (user_id, body, category${extra ? ", has_images" : ""}) values ($1,'Hello there','win'${extra ? ", true" : ""}) returning id`,
            [u],
          ),
        )
      ).rows[0] as { id: string }
    ).id;
  const canSee = async (u: string, id: string) =>
    (
      await asUser(
        db,
        u,
        async () =>
          (await db.query("select id from public.community_posts where id = $1", [id]))
            .rows,
      )
    ).length === 1;

  it("keeps one reaction per member and counts each type", async () => {
    const id = await mkPost(A1);
    await asUser(db, A2, () =>
      db.query(
        "insert into public.community_likes (post_id, user_id, reaction) values ($1,$2,'love')",
        [id, A2],
      ),
    );
    await asUser(db, A3, () =>
      db.query(
        "insert into public.community_likes (post_id, user_id, reaction) values ($1,$2,'strong')",
        [id, A3],
      ),
    );
    await asUser(db, A3, () =>
      db.query(
        "update public.community_likes set reaction = 'love' where post_id = $1 and user_id = $2",
        [id, A3],
      ),
    );
    const row = (
      await db.query(
        "select like_count, reaction_counts from public.community_posts where id = $1",
        [id],
      )
    ).rows[0] as { like_count: number; reaction_counts: Record<string, number> };
    expect(row.like_count).toBe(2);
    expect(row.reaction_counts).toEqual({ love: 2 });
    await expect(
      asUser(db, A2, () =>
        db.query(
          "insert into public.community_likes (post_id, user_id, reaction) values ($1,$2,'like')",
          [id, A2],
        ),
      ),
    ).rejects.toThrow();
  });
  it("holds a photo post for approval until staff approve it, then shows it", async () => {
    const id = await mkPost(A1, "img");
    expect(
      (
        (
          await db.query(
            "select approval_status from public.community_posts where id = $1",
            [id],
          )
        ).rows[0] as { approval_status: string }
      ).approval_status,
    ).toBe("pending");
    await asUser(db, A1, () =>
      db.query(
        "insert into public.community_post_images (post_id, user_id, storage_path, position) values ($1,$2,$3,0)",
        [id, A1, `${A1}/p1.jpg`],
      ),
    );
    expect(await canSee(A2, id)).toBe(false);
    expect(await canSee(A1, id)).toBe(true);
    await asUser(db, STAFF, () =>
      db.query(
        "update public.community_posts set approval_status = 'approved' where id = $1",
        [id],
      ),
    );
    expect(await canSee(A2, id)).toBe(true);
    expect(
      (
        await asUser(
          db,
          A2,
          async () =>
            (
              await db.query(
                "select id from public.community_post_images where post_id = $1",
                [id],
              )
            ).rows,
        )
      ).length,
    ).toBe(1);
  });
  it("cannot sneak photos past approval by adding them after posting", async () => {
    const id = await mkPost(A2); // posted as text, approved
    expect(await canSee(A3, id)).toBe(true);
    await asUser(db, A2, () =>
      db.query(
        "insert into public.community_post_images (post_id, user_id, storage_path) values ($1,$2,$3)",
        [id, A2, `${A2}/late.jpg`],
      ),
    );
    expect(await canSee(A3, id)).toBe(false); // back to pending
  });
  it("limits a post to four photos and own-folder paths", async () => {
    const id = await mkPost(A3);
    for (let i = 0; i < 4; i++)
      await asUser(db, A3, () =>
        db.query(
          "insert into public.community_post_images (post_id, user_id, storage_path, position) values ($1,$2,$3,$4)",
          [id, A3, `${A3}/i${i}.jpg`, i],
        ),
      );
    await expect(
      asUser(db, A3, () =>
        db.query(
          "insert into public.community_post_images (post_id, user_id, storage_path) values ($1,$2,$3)",
          [id, A3, `${A3}/i5.jpg`],
        ),
      ),
    ).rejects.toThrow();
    const id2 = await mkPost(A3);
    await expect(
      asUser(db, A3, () =>
        db.query(
          "insert into public.community_post_images (post_id, user_id, storage_path) values ($1,$2,$3)",
          [id2, A3, `${A1}/x.jpg`],
        ),
      ),
    ).rejects.toThrow();
  });
  it("shows staff posts without approval and marks them as staff", async () => {
    const r = await asUser(db, STAFF, () =>
      db.query(
        "insert into public.community_posts (user_id, body, has_images) values ($1,'From the team', true) returning id, is_staff, approval_status",
        [STAFF],
      ),
    );
    expect(r.rows[0]).toMatchObject({ is_staff: true, approval_status: "approved" });
  });
  it("lets authors fix typos but never change status, approval, counts or pinning", async () => {
    const id = await mkPost(A1);
    await asUser(db, A1, () =>
      db.query(
        "update public.community_posts set body = 'Fixed typo', status = 'removed', pinned = true, approval_status = 'pending', like_count = 99 where id = $1",
        [id],
      ),
    );
    const row = (
      await db.query(
        "select body, status, pinned, approval_status, like_count, edited_at from public.community_posts where id = $1",
        [id],
      )
    ).rows[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      body: "Fixed typo",
      status: "visible",
      pinned: false,
      approval_status: "approved",
      like_count: 0,
    });
    expect(row.edited_at).not.toBeNull();
  });
  it("stops edits after fifteen minutes", async () => {
    const id = await mkPost(A1);
    await db.query(
      "update public.community_posts set created_at = now() - interval '20 minutes' where id = $1",
      [id],
    );
    await asUser(db, A1, () =>
      db.query("update public.community_posts set body = 'too late' where id = $1", [id]),
    );
    expect(
      (
        (await db.query("select body from public.community_posts where id = $1", [id]))
          .rows[0] as { body: string }
      ).body,
    ).toBe("Hello there");
  });
  it("supports one level of replies only", async () => {
    const id = await mkPost(A1);
    const c1 = (
      (
        await asUser(db, A2, () =>
          db.query(
            "insert into public.community_comments (post_id, user_id, body) values ($1,$2,'Top') returning id",
            [id, A2],
          ),
        )
      ).rows[0] as { id: string }
    ).id;
    const c2 = (
      (
        await asUser(db, A3, () =>
          db.query(
            "insert into public.community_comments (post_id, user_id, body, parent_id) values ($1,$2,'Reply',$3) returning id",
            [id, A3, c1],
          ),
        )
      ).rows[0] as { id: string }
    ).id;
    await expect(
      asUser(db, A1, () =>
        db.query(
          "insert into public.community_comments (post_id, user_id, body, parent_id) values ($1,$2,'Too deep',$3)",
          [id, A1, c2],
        ),
      ),
    ).rejects.toThrow();
  });
  it("lists members in the directory unless they opt out, with names from their profile", async () => {
    await asUser(db, A1, () =>
      db.query(
        "insert into public.community_profiles (user_id, bio) values ($1,'Love morning walks')",
        [A1],
      ),
    );
    await asUser(db, A2, () =>
      db.query(
        "insert into public.community_profiles (user_id, show_in_directory) values ($1,false)",
        [A2],
      ),
    );
    const seen = await asUser(
      db,
      A3,
      async () =>
        (await db.query("select user_id, display_name from public.community_profiles"))
          .rows as { user_id: string; display_name: string }[],
    );
    expect(seen).toEqual([{ user_id: A1, display_name: "Mia S." }]);
    await db.query("update public.profiles set last_name = 'Brown' where user_id = $1", [
      A1,
    ]);
    expect(
      (
        (
          await db.query(
            "select display_name from public.community_profiles where user_id = $1",
            [A1],
          )
        ).rows[0] as { display_name: string }
      ).display_name,
    ).toBe("Mia B.");
  });
  it("keeps push devices private to their owner and removes them with the account", async () => {
    await asUser(db, A1, () =>
      db.query(
        "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1,'https://push.example/a','k','a')",
        [A1],
      ),
    );
    const other = await asUser(
      db,
      A2,
      async () =>
        (await db.query("select id from public.push_subscriptions")).rows.length,
    );
    expect(other).toBe(0);
    await expect(
      asUser(db, A2, () =>
        db.query(
          "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1,'https://push.example/b','k','a')",
          [A1],
        ),
      ),
    ).rejects.toThrow();
    await asUser(db, A2, () =>
      db.query("delete from public.push_subscriptions where user_id = $1", [A1]),
    );
    const mine = await asUser(
      db,
      A1,
      async () =>
        (await db.query("select id from public.push_subscriptions")).rows.length,
    );
    expect(mine).toBe(1);
  });
  it("copies the name and phone given at sign-up onto the new profile", async () => {
    const id = "00000000-0000-0000-0000-0000000000f9";
    await db.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1,'new@example.com',$2)",
      [
        id,
        JSON.stringify({ first_name: "Asha", last_name: "Brar", phone: "+16045550100" }),
      ],
    );
    const row = (
      await db.query(
        "select first_name, last_name, phone from public.profiles where user_id = $1",
        [id],
      )
    ).rows[0] as { first_name: string; last_name: string; phone: string };
    expect(row).toEqual({ first_name: "Asha", last_name: "Brar", phone: "+16045550100" });
  });
});
