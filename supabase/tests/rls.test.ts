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
