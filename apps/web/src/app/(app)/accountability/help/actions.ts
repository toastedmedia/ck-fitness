"use server";

import { redirect } from "next/navigation";
import { getContext } from "@/lib/app";
import { queueCrm, track } from "@/lib/events";

/** A member explicitly asks for a real person. Creates a support request and a CRM task. */
export async function sendHelpRequest(formData: FormData): Promise<void> {
  const { supabase, user } = await getContext();
  const message = String(formData.get("message") ?? "")
    .trim()
    .slice(0, 2000);
  const raw = String(formData.get("category") ?? "help");
  const category = ["help", "coaching", "billing", "other"].includes(raw) ? raw : "help";
  const program = String(formData.get("program") ?? "").slice(0, 120) || null;
  if (!message) redirect(`/accountability/help?error=message&topic=${category}`);

  const { error } = await supabase
    .from("support_requests")
    .insert({ user_id: user.id, category, message, program_slug: program });
  if (error) redirect(`/accountability/help?error=save&topic=${category}`);

  const event = category === "coaching" ? "coaching_interest" : "help_requested";
  await queueCrm(user.id, event, { category, program, message: message.slice(0, 500) });
  await track(user.id, event, { category });
  redirect("/accountability/help?sent=1");
}
