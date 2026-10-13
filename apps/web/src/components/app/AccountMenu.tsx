"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/** The round initial at the top right. Opens a small menu with Profile and Log out. */
export function AccountMenu({ initial }: { initial: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent)
        return e.key === "Escape" ? setOpen(false) : undefined;
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const item =
    "flex min-h-11 w-full items-center px-4 text-left text-sm font-semibold text-brand hover:bg-page";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid size-11 place-items-center rounded-full bg-brand text-sm font-bold text-on-brand"
      >
        {initial}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-48 overflow-hidden rounded-card border border-line bg-surface shadow-lg"
        >
          <Link
            role="menuitem"
            href="/profile"
            onClick={() => setOpen(false)}
            className={item}
          >
            Profile
          </Link>
          <Link
            role="menuitem"
            href="/membership"
            onClick={() => setOpen(false)}
            className={item}
          >
            Membership
          </Link>
          <Link
            role="menuitem"
            href="/accountability/help"
            onClick={() => setOpen(false)}
            className={item}
          >
            Help and support
          </Link>
          <form action="/auth/signout" method="post" className="border-t border-line">
            <button role="menuitem" className={`${item} text-danger`}>
              Log out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
