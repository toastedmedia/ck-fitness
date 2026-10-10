import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Runs the real migrations in an in-memory Postgres with a minimal stand-in for Supabase's
 * auth schema, so row-level security can be tested without a Supabase project.
 */
const MIGRATIONS = join(__dirname, "..", "migrations");

const AUTH_STUB = `
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
  create role authenticated nologin;
  create role anon nologin;
  grant usage on schema public, auth to authenticated, anon;
  alter default privileges in schema public grant all on tables to authenticated;
  alter default privileges in schema public grant all on sequences to authenticated;
`;

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  await db.exec(
    "grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated, anon;",
  );
  return db;
}

export async function addUser(db: PGlite, id: string, email = `${id}@example.com`) {
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
}

/** Run a callback as a signed-in member (RLS applies), then restore the superuser role. */
export async function asUser<T>(
  db: PGlite,
  id: string,
  fn: () => Promise<T>,
): Promise<T> {
  await db.exec(
    `set role authenticated; select set_config('request.jwt.sub', '${id}', false);`,
  );
  try {
    return await fn();
  } finally {
    await db.exec("reset role; select set_config('request.jwt.sub', '', false);");
  }
}

export const A = "00000000-0000-0000-0000-00000000000a";
export const B = "00000000-0000-0000-0000-00000000000b";
