import "server-only";
import webpush from "web-push";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Push is optional: with no keys set the app simply skips it. */
export function pushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT,
  );
}

/**
 * Sends a notification to every device the member has switched on, if her Push preference is on.
 * Never throws: a failed push must not break the action that caused it. Dead devices are removed.
 */
export async function sendPush(
  userId: string,
  n: { title: string; body?: string; link?: string },
) {
  if (!pushConfigured()) return;
  try {
    const db = createAdminSupabase();
    const { data: prefs } = await db
      .from("notification_preferences")
      .select("push")
      .eq("user_id", userId)
      .maybeSingle();
    if (!prefs?.push) return;
    const { data: subs } = await db
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", userId);
    if (!subs?.length) return;
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string,
    );
    const payload = JSON.stringify({
      title: n.title,
      body: n.body ?? "",
      link: n.link ?? "/notifications",
    });
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 86_400 },
          );
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410)
            await db.from("push_subscriptions").delete().eq("id", s.id);
          else console.error("push failed", code ?? (e as Error).message);
        }
      }),
    );
  } catch (e) {
    console.error("sendPush failed", (e as Error).message);
  }
}
