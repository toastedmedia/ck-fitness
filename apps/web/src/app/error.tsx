"use client";

import { useEffect } from "react";

/** Friendly fallback if something breaks while loading a page. Details go to the error monitor, not the screen. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error.digest ?? error.message);
  }, [error]);
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-4"
    >
      <h1 className="font-display text-2xl text-brand">Something went wrong</h1>
      <p className="text-muted">
        That did not load. Please try again. If it keeps happening, tell us and we will
        fix it.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="min-h-12 rounded-button bg-brand px-6 font-semibold text-on-brand"
        >
          Try again
        </button>
        <a
          href="/support"
          className="inline-flex min-h-12 items-center rounded-button border-2 border-brand px-6 font-semibold text-brand"
        >
          Contact support
        </a>
      </div>
    </main>
  );
}
