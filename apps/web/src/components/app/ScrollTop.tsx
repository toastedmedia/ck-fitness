"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Every time she switches page or tab, start at the very top (the header with the bell and avatar), not
 * partway down. Next only scrolls to the new page's content, which can leave the header out of view.
 */
export function ScrollTop() {
  const path = usePathname();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.scrollingElement?.scrollTo(0, 0);
  }, [path]);
  return null;
}
