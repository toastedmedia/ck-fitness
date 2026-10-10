#!/usr/bin/env node
/**
 * Creates the four QA test accounts (free, member, premium, owner) in a STAGING Supabase project.
 * Never run against production. Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TEST_PASSWORD='choose-one' \
 *     node scripts/create-test-users.mjs --staging
 * Re-running is safe: existing accounts are left alone.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.TEST_PASSWORD;
if (!process.argv.includes("--staging")) {
  console.error(
    "Refusing to run without --staging. This script must never touch production.",
  );
  process.exit(1);
}
if (!url || !key || !password || password.length < 10) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and TEST_PASSWORD (10+ characters).",
  );
  process.exit(1);
}
console.log(`Target project: ${new URL(url).host}`);

const db = createClient(url, key, { auth: { persistSession: false } });
const domain = "test.chardikalafitness.com";
const DAY = 86_400_000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * DAY).toISOString();
const USERS = [
  { email: `free@${domain}`, name: ["Fran", "Free"] },
  { email: `incomplete@${domain}`, name: ["Ines", "Incomplete"], incomplete: true },
  {
    email: `member@${domain}`,
    name: ["Mia", "Member"],
    membership: { entitlement: "ck_member", status: "active", period_end: iso(20) },
  },
  {
    email: `cancelling@${domain}`,
    name: ["Cam", "Cancelling"],
    membership: {
      entitlement: "ck_member",
      status: "active",
      period_end: iso(6),
      cancel_at_period_end: true,
    },
  },
  {
    email: `expired@${domain}`,
    name: ["Eve", "Expired"],
    membership: { entitlement: "ck_member", status: "canceled", period_end: iso(-5) },
  },
  {
    email: `billing@${domain}`,
    name: ["Bea", "Billing"],
    membership: { entitlement: "ck_member", status: "past_due", period_end: iso(-2) },
  },
  {
    email: `premium@${domain}`,
    name: ["Pia", "Premium"],
    membership: { entitlement: "ck_premium", status: "active", period_end: null },
  },
  { email: `owner1@${domain}`, name: ["Kv", "Owner"], staff: "owner" },
  { email: `owner2@${domain}`, name: ["Chanveer", "Owner"], staff: "owner" },
  { email: `content@${domain}`, name: ["Cory", "Content"], staff: "content_manager" },
  { email: `support@${domain}`, name: ["Sam", "Support"], staff: "support" },
];

for (const u of USERS) {
  let id;
  const { data, error } = await db.auth.admin.createUser({
    email: u.email,
    password,
    email_confirm: true,
  });
  if (error) {
    if (!/already|registered/i.test(error.message)) throw error;
    const { data: existing } = await db
      .from("profiles")
      .select("user_id")
      .eq("email", u.email)
      .maybeSingle();
    id = existing?.user_id;
    console.log(`exists  ${u.email}`);
  } else {
    id = data.user.id;
    console.log(`created ${u.email}`);
  }
  if (!id) continue;
  await db
    .from("profiles")
    .update({
      first_name: u.name[0],
      last_name: u.name[1],
      birth_date: "1990-01-01",
      gender_preference: "prefer_not_to_say",
      onboarding_complete: true,
    })
    .eq("user_id", id);
  await db.from("onboarding_profiles").upsert(
    {
      user_id: id,
      height_cm: 168,
      starting_weight_kg: 68,
      primary_goal: "general_fitness",
      level: "beginner",
      training_location: "home",
      equipment: ["mat"],
      preferred_days: [0, 2, 4],
      reminder_time: "07:00",
      weekly_commitment: 3,
      health_ack_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  await db.from("accountability_plans").upsert(
    {
      user_id: id,
      weekly_target_workouts: 3,
      preferred_days: [0, 2, 4],
      reminder_time: "07:00",
    },
    { onConflict: "user_id" },
  );
  await db
    .from("weigh_ins")
    .upsert(
      { user_id: id, log_date: new Date().toISOString().slice(0, 10), weight_kg: 68 },
      { onConflict: "user_id,log_date" },
    );
  if (u.membership)
    await db.from("memberships").upsert(
      {
        user_id: id,
        provider: "manual",
        source: "manual",
        entitlement: u.membership,
        status: "active",
        period_end: null,
      },
      { onConflict: "user_id" },
    );
  if (u.staff)
    await db
      .from("staff_roles")
      .upsert(
        { user_id: id, role: u.staff, active: true },
        { onConflict: "user_id,role" },
      );
}
console.log("Done. Log in with these emails and the password you supplied.");
