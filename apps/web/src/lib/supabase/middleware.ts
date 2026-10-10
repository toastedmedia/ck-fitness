import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = [
  "/home",
  "/onboarding",
  "/programs",
  "/progress",
  "/accountability",
  "/profile",
  "/membership",
  "/notifications",
  "/admin",
];
const GUEST_ONLY = ["/login", "/signup"];

const startsWith = (path: string, list: string[]) =>
  list.some((p) => path === p || path.startsWith(`${p}/`));

/** Refreshes the login session on every request and applies the simple route guards. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;

  // Without Supabase configured (fresh checkout), only protected pages are blocked.
  if (!url || !key) {
    if (startsWith(path, PROTECTED))
      return NextResponse.redirect(new URL("/login", request.url));
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && startsWith(path, PROTECTED)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (user && startsWith(path, GUEST_ONLY)) {
    return NextResponse.redirect(new URL("/home", request.url));
  }
  return response;
}
