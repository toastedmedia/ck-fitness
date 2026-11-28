import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** The public website lives on chardikalafitness.com (and www); the app on app.chardikalafitness.com. */
const WEBSITE = /^(www\.)?chardikalafitness\.com$/i;
const SITE_PAGES: Record<string, string> = {
  "/": "/site/index.html",
  "/links": "/site/links.html",
};

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0];
  if (WEBSITE.test(host)) {
    const path = request.nextUrl.pathname;
    const page = SITE_PAGES[path.replace(/\/$/, "") || "/"];
    if (page) {
      const url = request.nextUrl.clone();
      url.pathname = page;
      return NextResponse.rewrite(url);
    }
    // Website files and the tracking endpoint stay on the website.
    if (path.startsWith("/site/") || path === "/api/meta-capi")
      return NextResponse.next();
    // Anything else (sign-in, app pages) belongs to the app.
    return NextResponse.redirect(
      new URL(`${path}${request.nextUrl.search}`, "https://app.chardikalafitness.com"),
      308,
    );
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.png|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|webp|ico|mp4|js)$).*)",
  ],
};
