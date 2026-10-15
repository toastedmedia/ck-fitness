"use client";
import { useEffect, useRef, useState } from "react";

type ActionFn = (formData: FormData) => void | Promise<void>;

/**
 * Wraps the Users table in a form with a toolbar. Tick people (or the select-all box in the header) and
 * the toolbar appears with the actions. The table itself is drawn by the server.
 */
export function UsersBulk({
  back,
  tags,
  programs,
  tagAction,
  accessAction,
  children,
}: {
  back: string;
  tags: { id: string; name: string }[];
  programs: { id: string; title: string }[];
  tagAction: ActionFn;
  accessAction: ActionFn;
  children: React.ReactNode;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const f = form.current;
    if (!f) return;
    const boxes = () =>
      Array.from(f.querySelectorAll<HTMLInputElement>('input[name="ids"]'));
    const refresh = () => {
      const all = boxes();
      const n = all.filter((b) => b.checked).length;
      setCount(n);
      const head = f.querySelector<HTMLInputElement>("[data-select-all]");
      if (head) {
        head.checked = n > 0 && n === all.length;
        head.indeterminate = n > 0 && n < all.length;
      }
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.matches("[data-select-all]")) boxes().forEach((b) => (b.checked = t.checked));
      refresh();
    };
    f.addEventListener("change", onChange);
    return () => f.removeEventListener("change", onChange);
  }, []);

  const btn =
    "min-h-10 rounded-xl border-2 border-line bg-surface px-3 text-xs font-bold text-brand hover:bg-page";
  const field =
    "min-h-10 rounded-xl border-2 border-line bg-surface px-2 text-sm font-normal";
  return (
    <form ref={form} className="flex flex-col gap-3">
      <input type="hidden" name="back" value={back} />
      <div
        className={`sticky top-2 z-10 flex flex-col gap-2 rounded-card border border-line bg-surface p-3 shadow-sm ${count === 0 ? "hidden" : ""}`}
        role="region"
        aria-label="Actions for selected members"
      >
        <p className="text-sm font-bold text-brand" role="status" aria-live="polite">
          {count} selected
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select name="tag_id" className={field} aria-label="Existing tag">
            <option value="">Choose a tag</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            name="new_tag"
            maxLength={30}
            placeholder="or type a new tag"
            className={field}
            aria-label="New tag name"
          />
          <button formAction={tagAction} name="mode" value="add" className={btn}>
            Add tag
          </button>
          <button formAction={tagAction} name="mode" value="remove" className={btn}>
            Remove tag
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select name="program_id" className={field} aria-label="Training to give">
            <option value="">Give a training…</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <button formAction={accessAction} className={btn}>
            Give access (up to 100)
          </button>
          <button formAction="/admin/users/export" formMethod="post" className={btn}>
            Download selected (CSV)
          </button>
        </div>
      </div>
      {children}
    </form>
  );
}
