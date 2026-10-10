import Link from "next/link";

/** Date, greeting, one supportive line, notifications and the profile shortcut. Kept compact. */
export function HomeHeader({
  date,
  greeting,
  name,
  line,
  unread,
  initial,
}: {
  date: string;
  greeting: string;
  name: string;
  line: string;
  unread: number;
  initial: string;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-muted">{date}</p>
        <h1 className="font-display text-[19px] leading-tight text-brand">
          {greeting}, {name}
        </h1>
        <p className="mt-0.5 text-xs text-muted">{line}</p>
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
        <Link
          href="/profile"
          aria-label="Profile"
          className="grid size-11 place-items-center rounded-full bg-brand text-sm font-bold text-on-brand"
        >
          {initial}
        </Link>
      </div>
    </header>
  );
}
