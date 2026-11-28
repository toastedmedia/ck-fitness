"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  EVENT_COOKIE,
  EVENT_MAP,
  GA_ID,
  META_PIXEL_ID,
  isUntrackedPath,
  type TrackEvent,
} from "@/lib/ad-tracking";

type Fbq = ((...a: unknown[]) => void) & {
  callMethod?: (...a: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  push?: unknown;
};
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...a: unknown[]) => void;
    fbq?: Fbq;
    _fbq?: Fbq;
    ckTrack?: (name: TrackEvent, params?: Record<string, string | number>) => void;
  }
}

/** Inside the App Store / Google Play app we never load trackers (Apple App Tracking Transparency). */
const inNativeApp = () =>
  typeof navigator !== "undefined" && navigator.userAgent.includes("CKFitnessApp");
const gaOn = () => Boolean(GA_ID) && GA_ID !== "off";
const metaOn = () => Boolean(META_PIXEL_ID) && META_PIXEL_ID !== "off";

function loadScript(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function boot() {
  if (gaOn() && !window.gtag) {
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("js", new Date());
    // Page views on every in-app page change come from GA4 enhanced measurement (history events).
    window.gtag("config", GA_ID, { anonymize_ip: true });
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
  }
  if (metaOn() && !window.fbq) {
    const n: Fbq = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args);
      else n.queue!.push(args);
    } as Fbq;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    window.fbq = n;
    window._fbq = n;
    loadScript("https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", META_PIXEL_ID);
  }
}

/** Sends one of our events to Google Analytics and the Meta Pixel. */
export function sendEvent(
  name: TrackEvent,
  params: Record<string, string | number> = {},
) {
  if (typeof window === "undefined" || inNativeApp()) return;
  const m = EVENT_MAP[name];
  if (!m) return;
  window.gtag?.("event", m.ga, params);
  window.fbq?.(m.metaStandard ? "track" : "trackCustom", m.meta, params);
}

/** Events a server action queued in a cookie before redirecting here. */
function flushQueued() {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${EVENT_COOKIE}=`))
    ?.slice(EVENT_COOKIE.length + 1);
  if (!raw) return;
  document.cookie = `${EVENT_COOKIE}=; Max-Age=0; path=/; secure; samesite=lax`;
  try {
    const list = JSON.parse(decodeURIComponent(raw)) as {
      n: TrackEvent;
      p?: Record<string, string | number>;
    }[];
    for (const e of list) sendEvent(e.n, e.p ?? {});
  } catch {
    /* ignore a broken cookie */
  }
}

/** Short, non-personal label for a clicked control. */
function labelOf(el: HTMLElement): string {
  const t =
    el.dataset.track ||
    el.getAttribute("aria-label") ||
    el.textContent ||
    (el as HTMLInputElement).value ||
    "";
  return t.replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * Loads Google Analytics 4 and the Meta Pixel on the website (not in the store app, not in admin),
 * sends a Meta PageView on every page change (GA4 counts page views itself), sends queued sign-up /
 * onboarding / training events, and records every button and link click as "button_click"
 * (GA4) / "ButtonClick" (Meta) with its label and the page it was on.
 */
export function AdTracking() {
  const pathname = usePathname();
  const search = useSearchParams();
  const booted = useRef(false);

  useEffect(() => {
    if (inNativeApp() || isUntrackedPath(pathname)) return;
    if (!booted.current) {
      boot();
      booted.current = true;
      window.ckTrack = sendEvent;
    }
    window.fbq?.("track", "PageView");
    flushQueued();
  }, [pathname, search]);

  useEffect(() => {
    if (inNativeApp()) return;
    const onClick = (ev: MouseEvent) => {
      if (isUntrackedPath(location.pathname)) return;
      const el = (ev.target as HTMLElement | null)?.closest<HTMLElement>(
        'a, button, [role="button"], input[type="submit"], summary',
      );
      if (!el || el.dataset.noTrack !== undefined) return;
      const label = labelOf(el);
      const href = el instanceof HTMLAnchorElement ? (el.getAttribute("href") ?? "") : "";
      // Never send email or phone links' details.
      const link = /^(mailto|tel|sms):/i.test(href)
        ? href.split(":")[0]
        : href.split("?")[0];
      const params = {
        button_text: label || "(no text)",
        page_path: location.pathname,
        ...(link ? { link_url: link.slice(0, 200) } : {}),
      };
      window.gtag?.("event", "button_click", params);
      window.fbq?.("trackCustom", "ButtonClick", params);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
