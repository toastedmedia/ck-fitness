import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses row-level security: use only in server routes that
 * have already verified who is calling and what they may do.
 */
export function createAdminSupabase() {
  return createClient(publicEnv().supabaseUrl, serverEnv().supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}
