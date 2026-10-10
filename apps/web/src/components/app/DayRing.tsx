"use client";

import { useEffect, useState } from "react";

/** The "your day" ring: fills from empty to the current percentage when the page opens. */
export function DayRing({ pct }: { pct: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  const C = 2 * Math.PI * 56;
  return (
    <div className="relative size-[132px] shrink-0">
      <svg
        viewBox="0 0 132 132"
        role="img"
        aria-label={`Your day is ${pct} percent complete`}
        className="size-full"
      >
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--success)" />
          </linearGradient>
        </defs>
        <circle
          cx="66"
          cy="66"
          r="56"
          fill="none"
          stroke="var(--line)"
          strokeWidth="12"
        />
        <circle
          cx="66"
          cy="66"
          r="56"
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="12"
          strokeLinecap="round"
          transform="rotate(-90 66 66)"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - shown / 100)}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,0.8,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <b className="text-[28px] font-extrabold leading-none tracking-tight text-brand tabular-nums">
          {pct}%
        </b>
        <span className="mt-1 text-[10px] font-semibold text-muted">of your day</span>
      </div>
    </div>
  );
}

export function MiniRing({ pct, label }: { pct: number; label: string }) {
  const C = 2 * Math.PI * 22;
  const p = Math.max(0, Math.min(1, pct));
  return (
    <div className="relative size-14 shrink-0">
      <svg viewBox="0 0 56 56" role="img" aria-label={label} className="size-full">
        <circle cx="28" cy="28" r="22" fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle
          cx="28"
          cy="28"
          r="22"
          fill="none"
          stroke="var(--success)"
          strokeWidth="6"
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - p)}
        />
      </svg>
      <b className="absolute inset-0 grid place-items-center text-[11px] font-extrabold text-brand">
        {Math.round(p * 100)}%
      </b>
    </div>
  );
}
