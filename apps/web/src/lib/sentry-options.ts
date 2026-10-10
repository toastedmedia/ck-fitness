import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Error monitoring must never capture health or personal data (Build Guide §3, §15).
 * We keep stack traces and page paths, and strip request bodies, cookies, headers and user details.
 */
export function scrub(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
  }
  delete event.user;
  delete event.extra;
  return event;
}

export const baseOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN),
  sendDefaultPii: false,
  tracesSampleRate: 0.05,
  beforeSend: scrub,
};
