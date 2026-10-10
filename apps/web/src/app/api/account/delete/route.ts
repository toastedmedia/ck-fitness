import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Permanently deletes the signed-in member. Related rows are removed by database cascade. */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.redirect(new URL("/login", request.url), { status: 303 });

  const form = await request.formData();
  if (String(form.get("confirm") ?? "").trim() !== "DELETE") {
    return NextResponse.redirect(new URL("/profile?error=confirm", request.url), {
      status: 303,
    });
  }
  const { error } = await createAdminSupabase().auth.admin.deleteUser(user.id);
  if (error)
    return NextResponse.redirect(new URL("/profile?error=delete", request.url), {
      status: 303,
    });
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/?deleted=1", request.url), { status: 303 });
}
