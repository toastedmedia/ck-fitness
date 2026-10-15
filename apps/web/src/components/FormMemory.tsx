"use client";
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Saved = { at: number; fields: [string, string, string][] };
const PREFIX = "ck-form:";
const MAX_AGE = 30 * 60 * 1000;

const store = {
  get(key: string): Saved | null {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as Saved) : null;
    } catch {
      return null;
    }
  },
  set(key: string, v: Saved) {
    try {
      sessionStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* private mode or full: the form just won't be remembered */
    }
  },
  clear(path: string) {
    try {
      for (const k of Object.keys(sessionStorage))
        if (k.startsWith(`${PREFIX}${path}:`)) sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

/** Sets a field the way a person would, so React forms that watch their fields stay in sync. */
function setField(el: HTMLElement, type: string, value: string) {
  if (el instanceof HTMLInputElement && (type === "checkbox" || type === "radio")) {
    const want = value === "1";
    if (el.checked !== want) el.click();
    return;
  }
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(
    new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
  );
}

function restore(path: string) {
  Array.from(document.forms).forEach((form, i) => {
    const saved = store.get(`${PREFIX}${path}:${i}`);
    if (!saved || Date.now() - saved.at > MAX_AGE) return;
    const used = new Set<Element>();
    for (const [name, type, value] of saved.fields) {
      const el = Array.from(form.elements).find(
        (e) =>
          (e as HTMLInputElement).name === name &&
          !used.has(e) &&
          ((e as HTMLInputElement).type ?? "") === type,
      ) as HTMLElement | undefined;
      if (!el) continue;
      used.add(el);
      setField(el, type, value);
    }
  });
  store.clear(path);
}

function Memory() {
  const path = usePathname();
  const params = useSearchParams();
  const failed = params.has("error");

  // Remember what was typed the moment a form is sent.
  useEffect(() => {
    const onSubmit = (e: Event) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() === "get")
        return;
      const fields: Saved["fields"] = [];
      for (const el of Array.from(form.elements)) {
        const f = el as HTMLInputElement;
        if (!f.name || f.disabled) continue;
        if (["password", "file", "hidden", "submit", "button"].includes(f.type)) continue;
        const value =
          f.type === "checkbox" || f.type === "radio" ? (f.checked ? "1" : "0") : f.value;
        fields.push([f.name, f.type ?? "", value]);
      }
      const index = Array.from(document.forms).indexOf(form);
      store.set(`${PREFIX}${path}:${index}`, { at: Date.now(), fields });
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, [path]);

  // After an error page reload, put the typed answers back. After a success, forget them.
  useEffect(() => {
    if (!failed) {
      store.clear(path);
      return;
    }
    const t = setTimeout(() => restore(path), 60);
    return () => clearTimeout(t);
  }, [path, failed, params]);

  return null;
}

/** Keeps what people typed when a form comes back with an error (passwords and files are never kept). */
export function FormMemory() {
  return (
    <Suspense fallback={null}>
      <Memory />
    </Suspense>
  );
}
