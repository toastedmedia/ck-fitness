import { REACTIONS, REPORT_REASONS, summarizeReactions, timeAgo } from "@ck/core";
import { Pill } from "@/components/app/ui";

export function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold ${name === "CK Team" ? "bg-accent text-on-accent" : "bg-brand text-on-brand"}`}
    >
      {name === "CK Team" ? "CK" : (name[0] ?? "?").toUpperCase()}
    </span>
  );
}

export function Byline({
  name,
  at,
  category,
  pinned,
  staff,
  edited,
}: {
  name: string;
  at: string;
  category: string;
  pinned?: boolean;
  staff?: boolean;
  edited?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <b className="block truncate text-xs text-brand">
          {name}
          {staff && name !== "CK Team" ? (
            <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-on-accent">
              CK Team
            </span>
          ) : null}
        </b>
        <span className="text-[10.5px] text-muted">
          {timeAgo(at)}
          {edited ? " · edited" : ""}
        </span>
      </div>
      {pinned ? <Pill tone="gold">Pinned</Pill> : null}
      <Pill tone={category === "announcement" ? "gold" : "navy"}>
        {category === "announcement"
          ? "Announcement"
          : category[0].toUpperCase() + category.slice(1)}
      </Pill>
    </div>
  );
}

/** Report form that opens in place. `action` is a server action already bound to what is being reported. */
export function ReportForm({
  action,
  label = "Report",
}: {
  action: (formData: FormData) => Promise<void>;
  label?: string;
}) {
  return (
    <details className="text-xs">
      <summary className="inline-flex min-h-9 cursor-pointer items-center font-bold text-muted underline underline-offset-4">
        {label}
      </summary>
      <form
        action={action}
        className="mt-2 flex flex-col gap-2 rounded-2xl border border-line bg-page p-3"
      >
        <label className="font-bold text-brand">
          Why are you reporting this?
          <select
            name="reason"
            required
            defaultValue=""
            className="mt-1 min-h-10 w-full rounded-xl border-2 border-line bg-surface px-2 text-sm font-normal"
          >
            <option value="" disabled>
              Choose a reason
            </option>
            {REPORT_REASONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="font-bold text-brand">
          Anything else? (optional)
          <textarea
            name="note"
            rows={2}
            maxLength={500}
            className="mt-1 w-full rounded-xl border-2 border-line bg-surface p-2 text-sm font-normal"
          />
        </label>
        <button className="min-h-10 self-start rounded-button bg-brand px-4 font-bold text-on-brand">
          Send report
        </button>
        <p className="text-[10.5px] text-muted">
          Reports are private. Posts with several reports are hidden until our team
          reviews them.
        </p>
      </form>
    </details>
  );
}

/** Photos on a post: 1 large, 2 side by side, 3 or 4 in a grid. Tapping opens the full photo. */
export function ImageGrid({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  const cols = urls.length === 1 ? "grid-cols-1" : "grid-cols-2";
  return (
    <ul className={`mt-2 grid gap-1 overflow-hidden rounded-2xl ${cols}`}>
      {urls.map((u, i) => (
        <li key={u} className={urls.length === 3 && i === 0 ? "col-span-2" : ""}>
          <a href={u} target="_blank" rel="noreferrer" aria-label={`Open photo ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={u}
              alt={`Photo ${i + 1} in this post`}
              loading="lazy"
              className={`w-full object-cover ${urls.length === 1 ? "max-h-96" : "aspect-square"} ${urls.length === 3 && i === 0 ? "!aspect-[2/1]" : ""}`}
            />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Reaction summary plus a picker. Tap a reaction; tap the same one again to remove it. */
export function ReactionBar({
  counts,
  mine,
  canReact,
  action,
}: {
  counts: Record<string, number> | null;
  mine: string | null;
  canReact: boolean;
  action: (reaction: string, current: string | null) => Promise<void>;
}) {
  const top = summarizeReactions(counts);
  const total = Object.values(counts ?? {}).reduce((a, b) => a + Number(b), 0);
  const current = REACTIONS.find(([k]) => k === mine);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {total > 0 ? (
        <span
          className="inline-flex items-center gap-1 text-xs text-muted"
          aria-label={`${total} reaction${total === 1 ? "" : "s"}`}
        >
          <span aria-hidden="true">{top.map((r) => r.emoji).join("")}</span>
          {total}
        </span>
      ) : null}
      {canReact ? (
        <details className="relative">
          <summary
            className={`inline-flex min-h-10 cursor-pointer list-none items-center rounded-full px-3 text-xs font-bold ${current ? "bg-[#f6efd6] text-[#6f5712]" : "text-muted"}`}
          >
            {current ? `${current[1]} ${current[2]}` : "React"}
          </summary>
          <div className="absolute left-0 top-11 z-10 flex gap-1 rounded-full border border-line bg-surface p-1 shadow-lg">
            {REACTIONS.map(([key, emoji, label]) => (
              <form key={key} action={action.bind(null, key, mine)}>
                <button
                  aria-label={label}
                  title={label}
                  className={`grid size-11 place-items-center rounded-full text-xl ${mine === key ? "bg-[#f6efd6]" : "hover:bg-page"}`}
                >
                  {emoji}
                </button>
              </form>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
