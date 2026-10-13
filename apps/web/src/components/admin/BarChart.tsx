import type { DayCount } from "@ck/core";

/** A small accessible bar chart: one bar per day, drawn to a single scale. */
export function BarChart({
  title,
  series,
  total,
  change,
}: {
  title: string;
  series: DayCount[];
  total: number;
  change: number | null;
}) {
  const max = Math.max(1, ...series.map((d) => d.count));
  const W = 300;
  const H = 70;
  const step = W / series.length;
  const summary = `${title}: ${total} in the last ${series.length} days${
    change === null
      ? ""
      : `, ${change >= 0 ? "up" : "down"} ${Math.abs(change)} percent on the period before`
  }.`;
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-brand">{title}</span>
        {change !== null ? (
          <span
            className={`text-xs font-bold ${change >= 0 ? "text-success" : "text-danger"}`}
          >
            {change >= 0 ? "+" : ""}
            {change}%
          </span>
        ) : null}
      </div>
      <b className="font-display text-3xl tabular-nums text-brand">{total}</b>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={summary}
        className="mt-2 h-20 w-full"
        preserveAspectRatio="none"
      >
        <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke="var(--line)" />
        {series.map((d, i) => {
          const h = d.count === 0 ? 0 : Math.max(2, (d.count / max) * (H - 4));
          return (
            <rect
              key={d.day}
              x={i * step + step * 0.15}
              y={H - h}
              width={step * 0.7}
              height={h}
              rx="1"
              fill="var(--accent-strong)"
            >
              <title>{`${d.day}: ${d.count}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{series[0]?.day.slice(5)}</span>
        <span>peak {max === 1 && total === 0 ? 0 : max}</span>
        <span>{series.at(-1)?.day.slice(5)}</span>
      </div>
    </div>
  );
}
