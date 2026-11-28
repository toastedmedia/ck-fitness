"use server";

import { redirect } from "next/navigation";
import { cancelBooking, moveBooking, type BookingRow } from "@/lib/bookings";
import { createAdminSupabase } from "@/lib/supabase/admin";

async function load(token: string) {
  if (!/^[\w-]{20,40}$/.test(token)) redirect("/");
  const db = createAdminSupabase();
  const { data } = await db
    .from("bookings")
    .select("*")
    .eq("manage_token", token)
    .maybeSingle();
  if (!data) redirect(`/booking/${token}`);
  return { db, booking: data as BookingRow };
}

export async function cancelMyBooking(token: string): Promise<void> {
  const { db, booking } = await load(token);
  await cancelBooking(db, booking, "member");
  redirect(`/booking/${token}?done=cancelled`);
}

export async function moveMyBooking(token: string, formData: FormData): Promise<void> {
  const { db, booking } = await load(token);
  const r = await moveBooking(db, booking, String(formData.get("start") ?? ""), "member");
  redirect(`/booking/${token}?${r === "ok" ? "done=moved" : `error=${r}`}`);
}
