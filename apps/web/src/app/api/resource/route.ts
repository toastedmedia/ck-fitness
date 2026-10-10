import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Downloads a lesson PDF through a two-minute signed link, only if she can see the lesson. */
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const lessonId = request.nextUrl.searchParams.get("lessonId");
  if (!lessonId) return NextResponse.json({ error: "Missing lesson." }, { status: 400 });

  const { data: lesson } = await supabase
    .from("lessons")
    .select("resource_path")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson?.resource_path)
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  const { data, error } = await createAdminSupabase()
    .storage.from("program-resources")
    .createSignedUrl(lesson.resource_path, 120);
  if (error || !data)
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
