"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Phase = "idle" | "run" | "done";

/**
 * A thin gold line that fills while the next page is loading, so a tap always shows feedback.
 * It starts when a link to another page is tapped (or a form is sent) and finishes when the new page appears.
 */
function Bar() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const timer = useRef<number | undefined>(undefined);
  const set = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const finish = () => {
    window.clearTimeout(timer.current);
    set("done");
    timer.current = window.setTimeout(() => set("idle"), 600);
  };

  // A new page (or new query) arrived: complete the line.
  useEffect(() => {
    if (phaseRef.current === "run") finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, search]);

  useEffect(() => {
    const start = (giveUpMs: number) => {
      window.clearTimeout(timer.current);
      set("run");
      timer.current = window.setTimeout(finish, giveUpMs);
    };
    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const raw = a.getAttribute("href");
      if (!raw || raw.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      )
        return;
      start(10_000);
    };
    const onSubmit = (e: SubmitEvent) => {
      if (e.defaultPrevented) return;
      // A form may stay on the same page (saving), so give up sooner than for a link.
      start(2_500);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 z-[70] h-[3px]"
      style={{ top: "env(safe-area-inset-top, 0px)" }}
    >
      {phase === "idle" ? null : (
        <div className={phase === "run" ? "ck-bar-run" : "ck-bar-done"} />
      )}
    </div>
  );
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
