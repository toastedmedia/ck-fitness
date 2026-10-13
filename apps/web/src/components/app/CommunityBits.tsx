import { REPORT_REASONS, timeAgo } from "@ck/core";
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
}: {
  name: string;
  at: string;
  category: string;
  pinned?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <b className="block truncate text-xs text-brand">{name}</b>
        <span className="text-[10.5px] text-muted">{timeAgo(at)}</span>
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
