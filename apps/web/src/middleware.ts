import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/** The public website lives on chardikalafitness.com (and www); the app on app.chardikalafitness.com. */
const WEBSITE = /^(www\.)?chardikalafitness\.com$/i;
/**
 * Short links for Instagram etc.: chardikalafitness.com/dm -> the free app sign-up with UTM tags,
 * so Google Analytics shows "instagram / dm" (Reports -> Acquisition -> Traffic acquisition).
 * Temporary (302) redirects, so a destination can be changed later.
 */
const APP_SIGNUP = "https://app.chardikalafitness.com/signup";
const LINKS_PAGE = "https://chardikalafitness.com/links";
const SHORT_LINKS: Record<string, string> = {
  // Instagram DMs -> straight to the free app sign-up.
  "/dm": `${APP_SIGNUP}?utm_source=instagram&utm_medium=dm&utm_campaign=ig_dm`,
  // Instagram bio and stories -> the links page (book a call, WhatsApp, app, challenge).
  "/bio": `${LINKS_PAGE}?utm_source=instagram&utm_medium=bio&utm_campaign=ig_bio`,
  "/story": `${LINKS_PAGE}?utm_source=instagram&utm_medium=story&utm_campaign=ig_story`,
};
const SITE_PAGES: Record<string, string> = {
  "/": "/site/index.html",
  "/links": "/site/links.html",
};

export function middleware(request: NextRequest) {
  const host = (request.headers.get("host") ?? "").split(":")[0];
  if (WEBSITE.test(host)) {
    const path = request.nextUrl.pathname;
    const short = SHORT_LINKS[path.replace(/\/$/, "").toLowerCase()];
    if (short) return NextResponse.redirect(short, 302);
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
