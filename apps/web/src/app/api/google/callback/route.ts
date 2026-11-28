import { NextResponse, type NextRequest } from "next/server";
import { audit, requireStaff } from "@/lib/admin";
import { checkState, connectGoogle } from "@/lib/google-calendar";
import { CRM_ROLES } from "@/lib/leads";

export const dynamic = "force-dynamic";

/** Google sends the coach back here after the permission screen. */
export async function GET(request: NextRequest) {
  const { user, db, supabase } = await requireStaff([...CRM_ROLES]);
  const back = (q: string) =>
    NextResponse.redirect(
      new URL(`/admin/calendar?view=settings&${q}`, request.nextUrl.origin),
    );
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const code = request.nextUrl.searchParams.get("code");
  if (request.nextUrl.searchParams.get("error")) return back("error=google_denied");
  if (
    !code ||
    state !== request.cookies.get("ck_google_state")?.value ||
    !checkState(state, user.id)
  )
    return back("error=google_state");
  const r = await connectGoogle(db, code, user.id);
  if (!r.ok) return back(`error=google&msg=${encodeURIComponent(r.error ?? "")}`);
  await audit(supabase, user.id, "booking.google_connect", r.email ?? "");
  const res = back("saved=google_connected");
  res.cookies.delete("ck_google_state");
  return res;
}
