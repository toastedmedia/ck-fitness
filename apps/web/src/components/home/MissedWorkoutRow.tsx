"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BARRIERS } from "@ck/core";
import { recoverWorkout, saveBarrier } from "@/app/(app)/actions";

const chip =
  "inline-flex min-h-10 items-center rounded-button border-2 border-line bg-surface px-3 text-xs font-bold text-brand disabled:opacity-60";

/** Missed-workout recovery: Do it today, Move on, or Need help (which asks what got in the way). */
export function MissedWorkoutRow({
  actionId,
  title,
  detail,
}: {
  actionId: string;
  title: string;
  detail: string;
}) {
  const [mode, setMode] = useState<"choose" | "reasons" | "thanks">("choose");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const run = (
    fn: () => Promise<{ error?: string; ok?: boolean } | void>,
    next?: "thanks",
  ) =>
    start(async () => {
      const r = await fn();
      if (r && r.error) return setError(r.error);
      setError(undefined);
      if (next) setMode(next);
    });

  if (mode === "thanks") {
    return (
      <div className="px-1">
        <b className="block text-[13px] text-brand">Thanks for letting us know.</b>
        <span className="text-[11.5px] text-muted">
          That helps CK support you better.
        </span>
        <Link
          href="/accountability/help"
          className="mt-1 block min-h-10 text-xs font-bold text-brand underline underline-offset-4"
        >
          Talk to someone
        </Link>
      </div>
    );
  }
  return (
    <div className="px-1">
      <b className="block text-[13px] leading-snug text-brand">
        {mode === "reasons" ? "What's getting in the way?" : title}
      </b>
      {mode === "choose" ? (
        <span className="text-[11.5px] text-muted">{detail}</span>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {mode === "choose" ? (
          <>
            <button
              type="button"
              disabled={pending}
              className={`${chip} !border-brand !bg-brand !text-on-brand`}
              onClick={() => run(() => recoverWorkout(actionId, "reschedule"))}
            >
              Do it today
            </button>
            <button
              type="button"
              disabled={pending}
              className={chip}
              onClick={() => run(() => recoverWorkout(actionId, "skip"))}
            >
              Move on
            </button>
            <button
              type="button"
              disabled={pending}
              className={chip}
              onClick={() => setMode("reasons")}
            >
              Need help
            </button>
          </>
        ) : (
          BARRIERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              disabled={pending}
              className={chip}
              onClick={() => run(() => saveBarrier(actionId, value), "thanks")}
            >
              {label}
            </button>
          ))
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
