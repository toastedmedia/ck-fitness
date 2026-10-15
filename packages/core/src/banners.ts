/** Home banners: who sees one, and where it may link. Pure so it is tested. */
export interface BannerLike {
  active: boolean;
  audience: string;
  starts_at: string | null;
  ends_at: string | null;
}

export function bannerVisible(b: BannerLike, now: Date, isMember: boolean): boolean {
  if (!b.active) return false;
  if (b.starts_at && new Date(b.starts_at) > now) return false;
  if (b.ends_at && new Date(b.ends_at) < now) return false;
  if (b.audience === "member") return isMember;
  if (b.audience === "free") return !isMember;
  return true;
}

/** Inside the store apps only links within the app are allowed, and never to buying pages. */
export function bannerLink(
  url: string,
  native: boolean,
): { href: string; external: boolean } | null {
  const u = url.trim();
  if (!u) return null;
  if (u.startsWith("/") && !u.startsWith("//")) {
    if (u.startsWith("/admin")) return null;
    if (native && /^\/(membership|api\/stripe)/.test(u)) return null;
    return { href: u, external: false };
  }
  if (native) return null;
  return /^https:\/\/[^\s]+$/i.test(u) ? { href: u, external: true } : null;
}

export function validBannerLink(url: string): boolean {
  return url.trim() === "" || bannerLink(url, false) !== null;
}
