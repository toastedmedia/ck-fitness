"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav
      aria-label="Admin"
      className="flex gap-1 overflow-x-auto bg-brand p-2 md:fixed md:inset-y-0 md:left-0 md:w-60 md:flex-col md:overflow-visible md:p-4"
    >
      <p className="hidden px-3 pb-4 pt-2 font-display text-xl text-on-brand md:block">
        Chardikala Fitness
        <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
          Admin
        </span>
      </p>
      {items.map((i) => {
        const on = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-card px-3 text-sm font-semibold ${on ? "bg-white/15 text-on-brand" : "text-[#c9cbe0]"}`}
          >
            {i.label}
          </Link>
        );
      })}
      <Link
        href="/home"
        className="ml-auto inline-flex min-h-11 shrink-0 items-center px-3 text-sm text-[#c9cbe0] md:mt-auto md:ml-0"
      >
        Back to app
      </Link>
    </nav>
  );
}
