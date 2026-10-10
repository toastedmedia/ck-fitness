"use client";

import { useState, useTransition } from "react";

type Result = { error?: string; ok?: boolean } | void;

/** Runs a server action on tap, shows progress, and surfaces a plain-English error if it fails. */
export function ActionButton({
  run,
  children,
  variant = "ghost",
  className = "",
  ariaLabel,
}: {
  run: () => Promise<Result>;
  children: React.ReactNode;
  variant?: "primary" | "gold" | "ghost" | "link";
  className?: string;
  ariaLabel?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const look = {
    primary: "bg-brand text-on-brand rounded-button px-4",
    gold: "bg-accent text-on-accent rounded-button px-4",
    ghost: "border-2 border-line text-brand rounded-button px-4",
    link: "text-brand underline underline-offset-4 px-1",
  }[variant];
  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await run();
            setError(r && r.error ? r.error : undefined);
          })
        }
        className={`inline-flex min-h-11 items-center justify-center text-xs font-bold disabled:opacity-60 ${look} ${className}`}
      >
        {children}
      </button>
      {error ? (
        <span role="alert" className="basis-full text-xs font-semibold text-danger">
          {error}
        </span>
      ) : null}
    </>
  );
}
