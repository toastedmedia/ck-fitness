"use client";
import { useEffect, useRef } from "react";

/** The "..." menu. It closes when you click anywhere else, press Escape, or choose something. */
export function ActionMenu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (e: Event) => {
      const d = ref.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.open) ref.current.open = false;
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary
        aria-label={label}
        className="grid size-9 cursor-pointer list-none place-items-center rounded-lg text-lg text-muted hover:bg-page [&::-webkit-details-marker]:hidden"
      >
        ⋯
      </summary>
      <div
        className="absolute right-0 top-9 z-20 flex min-w-40 flex-col rounded-xl border border-line bg-surface p-1 shadow-lg"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a,button"))
            window.setTimeout(() => {
              if (ref.current) ref.current.open = false;
            }, 60);
        }}
      >
        {children}
      </div>
    </details>
  );
}
