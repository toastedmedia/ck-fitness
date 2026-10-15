"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Group = { label: string; items: { href: string; label: string }[] };

/** One simple line icon per section (24 x 24, drawn with strokes). */
const ICONS: Record<string, string> = {
  "/admin": "M4 13h6V4H4zM14 20h6V11h-6zM14 4h6v4h-6zM4 20h6v-4H4z",
  "/admin/kpis": "M4 20V10M10 20V4M16 20v-7M22 20H2",
  "/admin/users":
    "M9 4a3 3 0 100 6 3 3 0 000-6zM3 20c.5-3.5 3-5 6-5s5.5 1.5 6 5M17 6a2.4 2.4 0 110 4.8M16 14.2c2.6 0 4.5 1.3 5 4.3",
  "/admin/accountability": "M12 3a9 9 0 100 18 9 9 0 000-18zM8 12.5l3 3 5-6",
  "/admin/support": "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  "/admin/programs": "M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19V5",
  "/admin/tags": "M3 12V4h8l10 10-8 8zM7.5 8.5h.01",
  "/admin/community": "M5 5h14v10H10l-5 4zM9 9h6",
  "/admin/emails": "M3 6h18v12H3zM3 7l9 7 9-7",
  "/admin/notifications": "M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4",
  "/admin/billing": "M3 7h18v10H3zM3 11h18M7 15h3",
  "/admin/settings":
    "M12 9a3 3 0 100 6 3 3 0 000-6zM4 12l2-1 .5-2-1-2 2-2 2 1 2-.5 1-2h3l1 2 2 .5 2-1 2 2-1 2 .5 2 2 1v3l-2 1-.5 2 1 2-2 2-2-1-2 .5-1 2h-3l-1-2-2-.5-2 1-2-2 1-2-.5-2-2-1z",
  "/admin/crm": "M4 12a8 8 0 0114-5.3M20 4v5h-5M20 12a8 8 0 01-14 5.3M4 20v-5h5",
  "/admin/audit": "M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6",
};

export function AdminNav({ groups }: { groups: Group[] }) {
  const path = usePathname();
  const isOn = (href: string) =>
    href === "/admin" ? path === "/admin" : path.startsWith(href);
  return (
    <nav
      aria-label="Admin"
      className="flex gap-1 overflow-x-auto bg-brand p-2 md:fixed md:inset-y-0 md:left-0 md:w-60 md:flex-col md:gap-0 md:overflow-y-auto md:overflow-x-hidden md:p-4"
    >
      <p className="hidden px-3 pb-3 pt-2 font-display text-xl text-on-brand md:block">
        Chardikala Fitness
        <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
          Admin
        </span>
      </p>
      {groups.map((g) => (
        <div key={g.label} className="flex gap-1 md:mt-3 md:flex-col md:gap-0.5">
          <p className="hidden px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-accent md:block">
            {g.label}
          </p>
          {g.items.map((i) => {
            const on = isOn(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={`inline-flex min-h-10 shrink-0 items-center gap-2.5 rounded-card px-3 text-sm font-semibold ${on ? "bg-white/15 text-on-brand" : "text-[#c9cbe0] hover:bg-white/10"}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-[18px] shrink-0 fill-none stroke-current"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={ICONS[i.href] ?? "M12 6v12M6 12h12"} />
                </svg>
                {i.label}
              </Link>
            );
          })}
        </div>
      ))}
      <Link
        href="/home"
        className="ml-auto inline-flex min-h-10 shrink-0 items-center px-3 text-sm text-[#c9cbe0] hover:text-on-brand md:mt-6 md:ml-0 md:border-t md:border-white/15 md:pt-3"
      >
        Back to app
      </Link>
    </nav>
  );
}
