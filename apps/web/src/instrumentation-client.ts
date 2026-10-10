import * as Sentry from "@sentry/nextjs";
import { baseOptions } from "@/lib/sentry-options";

Sentry.init({ ...baseOptions, replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0 });

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
