"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { reorderOutline } from "@/app/admin/actions";

type Structure = { id: string; lessons: string[] }[];
type Drag = { kind: "lesson" | "section"; id: string };
type Target =
  | { type: "lesson"; id: string; after: boolean; el: HTMLElement }
  | { type: "section"; id: string; after: boolean; el: HTMLElement }
  | { type: "section-end"; id: string; el: HTMLElement };

/**
 * Drag and drop for the outline. The tree is drawn by the server; this adds the dragging on top. A drop
 * works out the new order of weeks and lessons (a lesson can move to another week) and saves it.
 */
export function OutlineDnd({
  programId,
  enabled,
  children,
}: {
  programId: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const el = root.current;
    if (!el || !enabled) return;
    let drag: Drag | null = null;
    let target: Target | null = null;
    let shown: HTMLElement | null = null;

    const clear = () => {
      if (shown) shown.style.boxShadow = "";
      shown = null;
    };
    const mark = (t: Target | null) => {
      clear();
      if (!t) return;
      shown = t.el;
      t.el.style.boxShadow =
        t.type === "section-end"
          ? "inset 0 0 0 2px var(--accent)"
          : t.after
            ? "0 3px 0 0 var(--accent)"
            : "0 -3px 0 0 var(--accent)";
    };
    const read = (): Structure =>
      Array.from(el.querySelectorAll<HTMLElement>("[data-section]")).map((s) => ({
        id: s.dataset.section as string,
        lessons: Array.from(s.querySelectorAll<HTMLElement>("[data-lesson]")).map(
          (l) => l.dataset.lesson as string,
        ),
      }));

    const onStart = (e: DragEvent) => {
      const t = e.target as HTMLElement;
      const lesson = t.closest<HTMLElement>("[data-lesson]");
      const section = t.closest<HTMLElement>("[data-section]");
      if (lesson) drag = { kind: "lesson", id: lesson.dataset.lesson as string };
      else if (section) drag = { kind: "section", id: section.dataset.section as string };
      else return;
      e.dataTransfer?.setData("text/plain", drag.id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    };
    const onOver = (e: DragEvent) => {
      if (!drag) return;
      const t = e.target as HTMLElement;
      const overLesson = t.closest<HTMLElement>("[data-lesson]");
      const overSection = t.closest<HTMLElement>("[data-section]");
      let next: Target | null = null;
      if (drag.kind === "lesson") {
        if (overLesson && overLesson.dataset.lesson !== drag.id) {
          const r = overLesson.getBoundingClientRect();
          next = {
            type: "lesson",
            id: overLesson.dataset.lesson as string,
            after: e.clientY > r.top + r.height / 2,
            el: overLesson,
          };
        } else if (!overLesson && overSection && overSection.dataset.type !== "phase") {
          next = {
            type: "section-end",
            id: overSection.dataset.section as string,
            el: overSection,
          };
        }
      } else if (overSection && overSection.dataset.section !== drag.id) {
        const r = overSection.getBoundingClientRect();
        next = {
          type: "section",
          id: overSection.dataset.section as string,
          after: e.clientY > r.top + Math.min(r.height / 2, 60),
          el: overSection,
        };
      }
      if (next) e.preventDefault();
      target = next;
      mark(next);
    };
    const onDrop = async (e: DragEvent) => {
      if (!drag || !target) return;
      e.preventDefault();
      const d = drag;
      const tg = target;
      drag = null;
      target = null;
      clear();
      const cur = read();
      let next: Structure;
      if (d.kind === "section") {
        const moving = cur.find((s) => s.id === d.id);
        if (!moving) return;
        const rest = cur.filter((s) => s.id !== d.id);
        const at =
          rest.findIndex((s) => s.id === tg.id) +
          (tg.type === "section" && tg.after ? 1 : 0);
        next = [...rest.slice(0, at), moving, ...rest.slice(at)];
      } else {
        const stripped = cur.map((s) => ({
          ...s,
          lessons: s.lessons.filter((l) => l !== d.id),
        }));
        next = stripped.map((s) => {
          if (tg.type === "section-end" && s.id === tg.id)
            return { ...s, lessons: [...s.lessons, d.id] };
          if (tg.type === "lesson" && s.lessons.includes(tg.id)) {
            const at = s.lessons.indexOf(tg.id) + (tg.after ? 1 : 0);
            return {
              ...s,
              lessons: [...s.lessons.slice(0, at), d.id, ...s.lessons.slice(at)],
            };
          }
          return s;
        });
      }
      setMsg("Saving the new order...");
      try {
        const r = await reorderOutline(programId, next);
        setMsg(r.ok ? "Order saved." : "That did not save. Please try again.");
        router.refresh();
      } catch {
        setMsg("That did not save. Please try again.");
      }
      window.setTimeout(() => setMsg(""), 2500);
    };
    const onEnd = () => {
      drag = null;
      target = null;
      clear();
    };

    el.addEventListener("dragstart", onStart);
    el.addEventListener("dragover", onOver);
    el.addEventListener("drop", onDrop);
    el.addEventListener("dragend", onEnd);
    return () => {
      el.removeEventListener("dragstart", onStart);
      el.removeEventListener("dragover", onOver);
      el.removeEventListener("drop", onDrop);
      el.removeEventListener("dragend", onEnd);
    };
  }, [enabled, programId, router]);

  return (
    <div ref={root}>
      {enabled ? (
        <p className="px-2 pb-1 text-[11px] text-muted" role="status" aria-live="polite">
          {msg ||
            "Drag the ⋮⋮ handle to reorder weeks or lessons. Drop a lesson on another week to move it."}
        </p>
      ) : null}
      {children}
    </div>
  );
}
