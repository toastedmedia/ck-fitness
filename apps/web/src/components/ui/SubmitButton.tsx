"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-button bg-brand px-6 py-3 text-base font-semibold text-on-brand hover:bg-brand-soft disabled:opacity-60"
    >
      {pending ? "One moment..." : children}
    </button>
  );
}
