/**
 * Central environment access. Public values are safe for the browser; server values
 * must only be read through serverEnv(), which refuses to run in the browser.
 */
export function requireValue(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function publicEnv() {
  return {
    supabaseUrl: requireValue(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    supabaseAnonKey: requireValue(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}

export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must never be called in the browser");
  }
  return {
    supabaseServiceRoleKey: requireValue(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  };
}
