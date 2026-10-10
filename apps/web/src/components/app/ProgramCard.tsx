import Link from "next/link";
import type { AccessLevel } from "@ck/core";
import { Pill } from "@/components/app/ui";

export interface CardProgram {
  slug: string;
  title: string;
  short_description: string;
  cover: string | null;
  access_level: AccessLevel;
  level: string | null;
  duration_label: string | null;
  tags: string[];
  locked: boolean;
  progressPct: number | null;
}

const LOCK = (
  <svg
    viewBox="0 0 24 24"
    className="size-3 fill-none stroke-current"
    strokeWidth="2.4"
    aria-hidden="true"
  >
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </svg>
);

export function ProgramCard({ p }: { p: CardProgram }) {
  const badge =
    p.access_level === "free" ? (
      <Pill>Free</Pill>
    ) : p.access_level === "coach_only" ? (
      <Pill tone="gold">Coaching</Pill>
    ) : (
      <Pill tone={p.locked ? "navy" : "gold"}>
        {p.locked ? <>{LOCK}&nbsp;Member</> : "Member"}
      </Pill>
    );
  return (
    <Link
      href={`/programs/${p.slug}`}
      className="block overflow-hidden rounded-card border border-line bg-surface"
    >
      {p.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.cover}
          alt=""
          loading="lazy"
          className="aspect-[16/8] w-full object-cover"
        />
      ) : (
        <div
          className="aspect-[16/8] w-full bg-gradient-to-br from-brand-soft to-brand"
          aria-hidden="true"
        />
      )}
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center justify-between gap-2">
          {badge}
          {p.progressPct !== null ? (
            <span className="text-[10.5px] font-bold text-success">
              {p.progressPct}% done
            </span>
          ) : null}
        </div>
        <h3 className="text-[13px] font-bold text-brand">{p.title}</h3>
        <p className="text-[11.5px] text-muted">{p.short_description}</p>
        <div className="flex flex-wrap gap-1.5">
          {p.duration_label ? <Pill tone="navy">{p.duration_label}</Pill> : null}
          {p.level ? (
            <Pill tone="navy">{p.level[0].toUpperCase() + p.level.slice(1)}</Pill>
          ) : null}
          {p.tags.map((t) => (
            <Pill key={t} tone="navy">
              {t}
            </Pill>
          ))}
        </div>
        {p.progressPct !== null ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${p.progressPct}%` }}
            />
          </div>
        ) : null}
      </div>
    </Link>
  );
}
