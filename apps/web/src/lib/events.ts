import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Server-side event helpers. They use the service-role client because members have no direct
 * access to these tables. Failures are logged and never block the member's action.
 */
export async function track(
  userId: string | null,
  name: string,
  properties: Record<string, unknown> = {},
) {
  const { error } = await createAdminSupabase()
    .from("analytics_events")
    .insert({ user_id: userId, event_name: name, properties });
  if (error) console.error("track failed", name, error.message);
}

/** Queue a lifecycle event for Toasted Media CRM. Payload must never contain health data. */
export async function queueCrm(
  userId: string | null,
  eventType: string,
  payload: Record<string, unknown> = {},
) {
  const { error } = await createAdminSupabase()
    .from("crm_sync_events")
    .insert({ user_id: userId, event_type: eventType, payload });
  if (error) console.error("queueCrm failed", eventType, error.message);
}

export async function notifyUser(
  userId: string,
  n: { kind: string; title: string; body?: string; link?: string },
) {
  const { error } = await createAdminSupabase()
    .from("notifications")
    .insert({
      user_id: userId,
      kind: n.kind,
      title: n.title,
      body: n.body ?? "",
      link: n.link ?? null,
    });
  if (error) console.error("notifyUser failed", error.message);
}
