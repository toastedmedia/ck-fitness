import "server-only";
import {
  fillTraining,
  renderCampaign,
  TRAINING_WELCOME_DEFAULT,
  type Campaign,
} from "@ck/core";
import { emailConfigured, sendRaw } from "@/lib/email/send";
import { imageUrlOf, siteBase } from "@/lib/email/campaign";
import type { createAdminSupabase } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminSupabase>;

export interface ProgramEmail {
  welcome_subject: string;
  welcome_heading: string;
  welcome_body: string;
  auto_welcome: boolean;
  /** False until the owners save their own text (the default text is shown instead). */
  saved: boolean;
}

/** The training's welcome email, or the starting text when none has been saved (or before 0035). */
export async function loadProgramEmail(db: Db, programId: string): Promise<ProgramEmail> {
  const { data } = await db
    .from("program_emails")
    .select("welcome_subject,welcome_heading,welcome_body,auto_welcome")
    .eq("program_id", programId)
    .maybeSingle();
  return {
    welcome_subject: data?.welcome_subject || TRAINING_WELCOME_DEFAULT.subject,
    welcome_heading: data?.welcome_heading || TRAINING_WELCOME_DEFAULT.heading,
    welcome_body: data?.welcome_body || TRAINING_WELCOME_DEFAULT.body,
    auto_welcome: Boolean(data?.auto_welcome),
    saved: Boolean(data),
  };
}

/** Who already got this training's welcome email, and when. Empty before 0035. */
export async function welcomeLog(
  db: Db,
  programId: string,
): Promise<Map<string, string>> {
  const { data } = await db
    .from("program_email_log")
    .select("user_id,sent_at")
    .eq("program_id", programId)
    .eq("kind", "welcome");
  return new Map(
    ((data ?? []) as { user_id: string; sent_at: string }[]).map((r) => [
      r.user_id,
      r.sent_at,
    ]),
  );
}

type Program = { id: string; title: string; slug: string; cover_path: string | null };

export function welcomeCampaign(p: Program, e: ProgramEmail): Campaign {
  return {
    subject: fillTraining(e.welcome_subject, p.title),
    preheader: fillTraining("Your access to {{training}} is ready.", p.title),
    heading: fillTraining(e.welcome_heading, p.title),
    body: fillTraining(e.welcome_body, p.title),
    imageUrl: imageUrlOf(p.cover_path),
    ctaLabel: "Start the training",
    ctaUrl: `/programs/${p.slug}`,
  };
}

/** Renders the welcome email for one person (also used for "Send a test to me"). */
export function renderWelcome(p: Program, e: ProgramEmail, firstName?: string | null) {
  return renderCampaign(
    welcomeCampaign(p, e),
    { name: firstName ?? undefined },
    {
      siteUrl: siteBase(),
      reason: `You are getting this because you were given ${p.title} in the Chardikala Fitness app.`,
    },
  );
}

/**
 * Sends the training's welcome email to these people, once each (anyone already in the log is
 * skipped). It is a service email about a training they were given, so it does not depend on the
 * marketing switches. Never throws.
 */
export async function sendWelcomeEmails(
  db: Db,
  programId: string,
  userIds: string[],
  by: string | null,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 };
  if (!emailConfigured() || !userIds.length) return out;
  try {
    const [{ data: prog }, e, log] = await Promise.all([
      db
        .from("programs")
        .select("id,title,slug,cover_path")
        .eq("id", programId)
        .maybeSingle(),
      loadProgramEmail(db, programId),
      welcomeLog(db, programId),
    ]);
    if (!prog) return out;
    const todo = [...new Set(userIds)].filter((u) => !log.has(u));
    out.skipped = userIds.length - todo.length;
    for (let i = 0; i < todo.length; i += 100) {
      const { data: profs } = await db
        .from("profiles")
        .select("user_id,email,first_name")
        .in("user_id", todo.slice(i, i + 100));
      for (const p of (profs ?? []) as {
        user_id: string;
        email: string | null;
        first_name: string | null;
      }[]) {
        if (!p.email) {
          out.failed++;
          continue;
        }
        const m = renderWelcome(prog as Program, e, p.first_name);
        const ok = await sendRaw({
          to: p.email,
          subject: m.subject,
          html: m.html,
          text: m.text,
        });
        if (!ok) {
          out.failed++;
          continue;
        }
        out.sent++;
        await db
          .from("program_email_log")
          .upsert(
            { program_id: programId, user_id: p.user_id, kind: "welcome", sent_by: by },
            { onConflict: "program_id,user_id,kind", ignoreDuplicates: true },
          );
      }
    }
  } catch (err) {
    console.error("welcome emails failed", (err as Error).message);
  }
  return out;
}

/** Called when someone is given a training: sends the welcome email if that training has it switched on. */
export async function autoWelcome(
  db: Db,
  programId: string,
  userId: string,
  by: string | null,
): Promise<void> {
  try {
    const [{ data: p }, e] = await Promise.all([
      db.from("programs").select("published").eq("id", programId).maybeSingle(),
      loadProgramEmail(db, programId),
    ]);
    // Only for a live training: a draft cannot be opened yet.
    if (!p?.published || !e.auto_welcome) return;
    await sendWelcomeEmails(db, programId, [userId], by);
  } catch {
    /* never block giving access */
  }
}
