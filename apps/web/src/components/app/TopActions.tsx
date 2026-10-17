"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu } from "./AccountMenu";

const TITLES: Record<string, string> = {
  "/programs": "Trainings",
  "/progress": "Progress",
  "/accountability": "My Week",
  "/community": "Community",
  "/community/members": "Members",
  "/profile": "Profile",
  "/profile/delete": "Delete account",
  "/nutrition": "Nutrition",
  "/nutrition/setup": "Nutrition targets",
  "/nutrition/log": "Log meal",
  "/nutrition/history": "History",
  "/membership": "Membership",
  "/notifications": "Notifications",
  "/progress/photos": "Progress photos",
  "/accountability/summary": "Your week",
  "/accountability/checkin": "Weekly check-in",
  "/accountability/diet": "Meal plan",
  "/accountability/help": "Talk to a real person",
  "/community/guidelines": "Community guidelines",
};

type Back = { href: string; label: string } | null;

/** The "back" link for detail pages, shown in the header so there is no empty row above the content. */
function backFor(path: string): Back {
  if (
    path === "/nutrition/setup" ||
    path === "/nutrition/log" ||
    /^\/nutrition\/meal\//.test(path)
  )
    return { href: "/nutrition", label: "Nutrition" };
  if (path === "/profile/delete") return { href: "/profile", label: "Profile" };
  if (path === "/accountability/diet")
    return { href: "/accountability", label: "My Week" };
  if (path === "/progress/photos") return { href: "/progress", label: "Progress" };
  if (path === "/community/guidelines") return { href: "/community", label: "Community" };
  if (/^\/community\/members\/[^/]+$/.test(path))
    return { href: "/community/members", label: "Members" };
  const post = path.match(/^\/community\/([^/]+)$/);
  if (post && !["members", "guidelines"].includes(post[1]))
    return { href: "/community", label: "Community" };
  if (/^\/programs\/[^/]+$/.test(path)) return { href: "/programs", label: "Trainings" };
  const lesson = path.match(/^\/programs\/([^/]+)\/[^/]+$/);
  if (lesson) return { href: `/programs/${lesson[1]}`, label: "Back to training" };
  return null;
}

/** Notifications and the account menu, top right of every signed-in page (Home has its own header). */
export function TopActions({ initial, unread }: { initial: string; unread: number }) {
  const path = usePathname();
  if (path === "/home") return null;
  const title = TITLES[path];
  const back = backFor(path);
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        {back ? (
          <Link
            href={back.href}
            className="inline-flex min-h-10 items-center text-xs font-bold text-brand"
          >
            ← {back.label}
          </Link>
        ) : null}
        {/* The page itself keeps a hidden heading for screen readers; this is the visible title. */}
        {title ? (
          <p aria-hidden="true" className="truncate font-display text-[19px] text-brand">
            {title}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
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
    </div>
  );
}
