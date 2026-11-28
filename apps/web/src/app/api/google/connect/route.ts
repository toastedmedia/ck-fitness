import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { googleAuthUrl, googleConfigured, newState } from "@/lib/google-calendar";
import { CRM_ROLES } from "@/lib/leads";

export const dynamic = "force-dynamic";

/** Admin -> Calendar -> Connect Google Calendar: sends the coach to Google's permission screen. */
export async function GET() {
  const { user } = await requireStaff([...CRM_ROLES]);
  if (!googleConfigured())
    return NextResponse.redirect(
      new URL(
        "/admin/calendar?view=settings&error=google_setup",
        process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.chardikalafitness.com",
      ),
    );
  const state = newState(user.id);
  const res = NextResponse.redirect(googleAuthUrl(state));
  res.cookies.set("ck_google_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 900,
    path: "/",
  });
  return res;
}
