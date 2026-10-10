"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/home", label: "Home", icon: "M3 11l9-8 9 8M5 10v10h14V10" },
  {
    href: "/programs",
    label: "Programs",
    icon: "M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19V5",
  },
  { href: "/progress", label: "Progress", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  {
    href: "/accountability",
    label: "Accountability",
    icon: "M12 3a9 9 0 100 18 9 9 0 000-18zM8 12.5l3 3 5-6",
  },
  {
    href: "/profile",
    label: "Profile",
    icon: "M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c1-4 4-6 8-6s7 2 8 6",
  },
] as const;

/** Bottom bar on phones, left sidebar on larger screens. Same five items either way. */
export function Nav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:inset-y-0 md:left-0 md:right-auto md:w-56 md:grid-cols-1 md:content-start md:gap-1 md:border-r md:border-t-0 md:p-4"
    >
      <p className="hidden px-3 pb-4 pt-2 font-display text-xl text-brand md:block">
        CK Fitness
      </p>
      {ITEMS.map((item) => {
        const on = path === item.href || path.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium md:min-h-12 md:flex-row md:justify-start md:gap-3 md:rounded-card md:px-3 md:text-sm ${
              on ? "font-bold text-brand md:bg-page" : "text-muted"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5 fill-none stroke-current"
              strokeWidth={on ? 2.2 : 1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={item.icon} />
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
