import "server-only";
import { crmRetryDelayMinutes } from "@ck/core";
import { createAdminSupabase } from "@/lib/supabase/admin";

/**
 * Toasted Media CRM adapter. The rest of the app only queues events (queueCrm); this file is the
 * ONLY place that knows the CRM's API. If the CRM changes, change the paths below and nothing else.
 * The endpoint paths and field names are a standard REST shape to be aligned with the real API.
 */
export function crmConfigured(): boolean {
  return Boolean(
    process.env.TOASTED_CRM_API_BASE_URL &&
    process.env.TOASTED_CRM_API_TOKEN &&
    process.env.TOASTED_CRM_WORKSPACE_ID,
  );
}

async function crmRequest(path: string, body: unknown): Promise<void> {
  const base = process.env.TOASTED_CRM_API_BASE_URL!.replace(/\/$/, "");
  const res = await fetch(
    `${base}/v1/workspaces/${process.env.TOASTED_CRM_WORKSPACE_ID}${path}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.TOASTED_CRM_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) throw new Error(`CRM ${path} responded ${res.status}`);
}

interface Contact {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

const syncContact = (
  c: Contact,
  change: {
    tagsAdd?: string[];
    tagsRemove?: string[];
    fields?: Record<string, unknown>;
  } = {},
) =>
  crmRequest("/contacts/upsert", {
    external_id: c.id,
    email: c.email,
    first_name: c.first_name,
    last_name: c.last_name,
    tags_add: change.tagsAdd ?? [],
    tags_remove: change.tagsRemove ?? [],
    fields: change.fields ?? {},
  });

const createTask = (
  c: Contact,
  type: string,
  title: string,
  priority: "normal" | "high",
  notes = "",
) => crmRequest("/tasks", { contact_external_id: c.id, type, title, priority, notes });

/** What each app event does in the CRM (Build Guide §13.1). Never sends health data or body numbers. */
async function deliver(eventType: string, c: Contact, payload: Record<string, unknown>) {
  switch (eventType) {
    case "free_account_created":
      return syncContact(c, {
        tagsAdd: ["CK APP - FREE"],
        fields: { app_user_id: c.id },
      });
    case "onboarding_completed":
      return syncContact(c, {
        fields: { goal: payload.goal, delivery_preference: payload.location },
      });
    case "membership_started":
      return syncContact(c, {
        tagsAdd: ["CK APP - MEMBER"],
        tagsRemove: ["CK APP - FREE", "CK APP - EXPIRED"],
      });
    case "membership_cancelled":
      return syncContact(c, {
        fields: { cancel_requested: true, access_until: payload.period_end },
      });
    case "membership_expired":
      return syncContact(c, {
        tagsAdd: ["CK APP - EXPIRED"],
        tagsRemove: ["CK APP - MEMBER"],
      });
    case "billing_problem":
      return createTask(c, "billing", "Member has a payment problem", "normal");
    case "at_risk_7d":
      return syncContact(c, { tagsAdd: ["CK APP - AT RISK 7D"] });
    case "at_risk_14d":
      return createTask(
        c,
        "retention",
        "Paid member inactive for 14 days",
        "normal",
        "Optional human follow-up for high-value members.",
      );
    case "at_risk_cleared":
      return syncContact(c, { tagsRemove: ["CK APP - AT RISK 7D"] });
    case "coaching_interest":
      return crmRequest("/opportunities", {
        contact_external_id: c.id,
        type: "coaching",
        source: "app",
        program: payload.program ?? null,
        notes: payload.message ?? "",
      });
    case "help_requested":
      return createTask(
        c,
        "support",
        "Member asked for help",
        "high",
        String(payload.message ?? ""),
      );
    case "program_completed":
      return syncContact(c, {
        tagsAdd: ["CK APP - PROGRAM COMPLETE"],
        fields: { last_program_completed: payload.program },
      });
    default:
      throw new Error(`Unknown CRM event type: ${eventType}`);
  }
}

/** Sends due events. Safe to run repeatedly; failures back off and stay visible in the admin portal. */
export async function processCrmQueue(
  limit = 25,
): Promise<{ sent: number; failed: number; skipped: boolean }> {
  if (!crmConfigured()) return { sent: 0, failed: 0, skipped: true };
  const db = createAdminSupabase();
  const { data: due } = await db
    .from("crm_sync_events")
    .select("*")
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .lt("attempts", 5)
    .order("created_at")
    .limit(limit);
  let sent = 0,
    failed = 0;
  for (const ev of (due ?? []) as {
    id: string;
    user_id: string | null;
    event_type: string;
    payload: Record<string, unknown>;
    attempts: number;
  }[]) {
    try {
      const { data: p } = ev.user_id
        ? await db
            .from("profiles")
            .select("user_id,email,first_name,last_name")
            .eq("user_id", ev.user_id)
            .maybeSingle()
        : { data: null };
      if (!p) throw new Error("Member no longer exists");
      await deliver(
        ev.event_type,
        {
          id: p.user_id,
          email: p.email,
          first_name: p.first_name,
          last_name: p.last_name,
        },
        ev.payload,
      );
      await db
        .from("crm_sync_events")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          last_error: null,
          attempts: ev.attempts + 1,
        })
        .eq("id", ev.id);
      sent++;
    } catch (e) {
      const attempts = ev.attempts + 1;
      const delay = crmRetryDelayMinutes(attempts - 1) ?? 0;
      await db
        .from("crm_sync_events")
        .update({
          status: "failed",
          attempts,
          last_error: String((e as Error).message).slice(0, 300),
          next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString(),
        })
        .eq("id", ev.id);
      failed++;
    }
  }
  return { sent, failed, skipped: false };
}
