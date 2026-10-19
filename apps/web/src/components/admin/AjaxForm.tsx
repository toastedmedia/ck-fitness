"use client";
import { useRef, useState, type FormHTMLAttributes, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AjaxResult } from "@/lib/ajax";

const ERROR_TEXT: Record<string, string> = {
  lesson: "Give the lesson a name first.",
  section: "Give it a name first.",
  save: "That did not save. Please try again.",
  cover: "That picture could not be used. Use a JPG, PNG or WebP under 2 MB.",
  resource: "That file could not be used. Use a PDF or picture under 4 MB.",
};

type Toast = { tone: "saving" | "ok" | "bad"; text: string } | null;

/**
 * A form that saves in the background: the page does not reload, a small message at the top says
 * "Saving..." then "Saved", and the outline refreshes quietly. The save itself is a normal server action
 * that sees `_ajax=1` and returns the address it would have gone to instead of redirecting.
 */
export function AjaxForm({
  action,
  children,
  ...rest
}: {
  action: (formData: FormData) => Promise<AjaxResult | void>;
  children: ReactNode;
} & Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit">) {
  const router = useRouter();
  const [toast, setToast] = useState<Toast>(null);
  const timer = useRef<number | undefined>(undefined);
  const busy = useRef(false);

  const say = (t: Toast, ms = 0) => {
    window.clearTimeout(timer.current);
    setToast(t);
    if (ms) timer.current = window.setTimeout(() => setToast(null), ms);
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    fd.set("_ajax", "1");
    say({ tone: "saving", text: "Saving…" });
    try {
      const r = await action(fd);
      const url = r && "url" in r ? r.url : "";
      const q = new URLSearchParams(url.split("?")[1] ?? "");
      const err = q.get("error");
      if (err)
        return say({ tone: "bad", text: ERROR_TEXT[err] ?? ERROR_TEXT.save }, 6000);
      say(
        {
          tone: "ok",
          text: q.has("lpub")
            ? "Saved and published. Members can see this lesson now."
            : q.has("lunpub")
              ? "Saved and moved to draft."
              : "Saved",
        },
        3500,
      );
      // A brand-new item has a new address; otherwise just refresh the outline quietly.
      const here = window.location.search;
      const next = url.includes("?") ? `?${url.split("?")[1]}` : "";
      const newItem =
        (q.get("lesson") ?? q.get("week")) !==
        (new URLSearchParams(here).get("lesson") ??
          new URLSearchParams(here).get("week"));
      if (newItem && url) router.replace(url.split("&saved")[0] || next);
      else router.refresh();
    } catch {
      say({ tone: "bad", text: ERROR_TEXT.save }, 6000);
    } finally {
      busy.current = false;
    }
  }

  return (
    <form {...rest} data-ajax="1" onSubmit={onSubmit}>
      {children}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 z-[80] flex justify-center px-4"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <span
            className={`rounded-full px-4 py-2 text-sm font-bold shadow-md ${
              toast.tone === "bad"
                ? "bg-danger text-on-brand"
                : toast.tone === "ok"
                  ? "bg-success text-on-brand"
                  : "bg-brand text-on-brand"
            }`}
          >
            {toast.text}
          </span>
        </div>
      ) : null}
    </form>
  );
}
