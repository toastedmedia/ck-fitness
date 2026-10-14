"use client";
import { useEffect } from "react";

/**
 * Marks the page when it runs inside the iPhone/Android app so the styles in globals.css can keep the
 * top (status bar) and bottom (home indicator) strips solid while the content scrolls.
 */
export function NativeShell() {
  useEffect(() => {
    if (navigator.userAgent.includes("CKFitnessApp"))
      document.documentElement.setAttribute("data-native", "1");
  }, []);
  return null;
}
