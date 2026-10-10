import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/** Browser client: anon key only, always subject to row-level security. */
export function createBrowserSupabase() {
  const { supabaseUrl, supabaseAnonKey } = publicEnv();
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
