import type { ReactNode } from "react";

export const aInput =
  "min-h-10 w-full rounded-xl border-2 border-line bg-surface px-3 text-sm";

export function H1({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="font-display text-2xl text-brand">{children}</h1>
      {right}
    </div>
  );
}
export function Panel({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-card border border-line bg-surface p-4 ${className}`}>
      {title ? <h2 className="mb-2 text-sm font-bold text-brand">{title}</h2> : null}
      {children}
    </section>
  );
}
export function Tile({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <b className="block font-display text-3xl tabular-nums text-brand">{value}</b>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}
export function Status({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "bad" | "mute";
  children: ReactNode;
}) {
  const t = {
    ok: "bg-success-soft text-success",
    warn: "bg-[#f6efd6] text-[#6f5712]",
    bad: "bg-[#f6dcd7] text-danger",
    mute: "bg-page text-muted",
  }[tone];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${t}`}>
      {children}
    </span>
  );
}
export function ABtn({
  children,
  variant = "ghost",
  ...rest
}: {
  variant?: "primary" | "ghost" | "danger";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = {
    primary: "bg-brand text-on-brand",
    ghost: "border-2 border-line text-brand",
    danger: "border-2 border-danger text-danger",
  }[variant];
  return (
    <button
      {...rest}
      className={`inline-flex min-h-10 items-center justify-center rounded-button px-4 text-xs font-bold disabled:opacity-60 ${v} ${rest.className ?? ""}`}
    >
      {children}
    </button>
  );
}
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-line px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export const td = "border-b border-line px-2 py-2.5 align-top";
export function Flash({ children, bad }: { children: ReactNode; bad?: boolean }) {
  return (
    <p
      role={bad ? "alert" : "status"}
      className={`rounded-card p-3 text-sm font-semibold ${bad ? "bg-[#f6dcd7] text-danger" : "bg-success-soft text-success"}`}
    >
      {children}
    </p>
  );
}
