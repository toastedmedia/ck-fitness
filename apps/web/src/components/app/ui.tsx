import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  // A caller's own background or border colour replaces the default instead of fighting it.
  const bg = /(^|\s)bg-/.test(className) ? "" : "bg-surface";
  const border = /(^|\s)border-(\[|[a-z])/.test(className)
    ? "border"
    : "border border-line";
  return (
    <section
      id={id}
      className={`rounded-card ${border} ${bg} p-[var(--space-card)] ${className}`}
    >
      {children}
    </section>
  );
}

export function Cap({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-accent-strong">
      {children}
    </p>
  );
}

export function Pill({
  children,
  tone = "success",
}: {
  children: ReactNode;
  tone?: "success" | "navy" | "gold";
}) {
  const t = {
    success: "bg-success-soft text-success",
    navy: "bg-page text-brand",
    gold: "bg-[#f6efd6] text-[#6f5712]",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${t}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: {
  variant?: "primary" | "gold" | "ghost";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const v = {
    primary: "bg-brand text-on-brand hover:bg-brand-soft",
    gold: "bg-accent text-on-accent",
    ghost: "border-2 border-line bg-transparent text-brand",
  }[variant];
  return (
    <button
      {...rest}
      className={`inline-flex min-h-11 items-center justify-center rounded-button px-4 text-xs font-bold disabled:opacity-60 ${v} ${className}`}
    >
      {children}
    </button>
  );
}

export function Flash({
  tone = "info",
  children,
}: {
  tone?: "info" | "error";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-card p-3 text-xs font-semibold ${tone === "error" ? "bg-surface text-danger" : "bg-success-soft text-success"}`}
    >
      {children}
    </p>
  );
}
