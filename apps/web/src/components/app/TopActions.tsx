"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu } from "./AccountMenu";

/** Notifications and the account menu, top right of every signed-in page (Home has its own header). */
export function TopActions({ initial, unread }: { initial: string; unread: number }) {
  const path = usePathname();
  if (path === "/home") return null;
  return (
    <div className="-mb-1 flex items-center justify-end gap-2">
      <Link
        href="/notifications"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        className="relative grid size-11 place-items-center rounded-full border-2 border-line bg-surface text-brand"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5 fill-none stroke-current"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" />
          <path d="M10 21h4" />
        </svg>
        {unread ? (
          <span className="absolute right-2 top-2 size-2.5 rounded-full border-2 border-surface bg-accent" />
        ) : null}
      </Link>
      <AccountMenu initial={initial} />
    </div>
  );
}
