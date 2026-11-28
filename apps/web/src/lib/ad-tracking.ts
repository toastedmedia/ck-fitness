/**
 * Ad and analytics tracking IDs (public, safe in the browser). Owners: Toasted Media.
 * - Google Analytics 4: account/property "CK Fitness", web stream "CK Fitness web app".
 * - Meta Pixel "Chardikala Fitness" (Toasted Media business), connected to the "CK Fitness" ad account.
 * Override with NEXT_PUBLIC_GA_ID / NEXT_PUBLIC_META_PIXEL_ID in Vercel; set either to "off" to disable.
 */
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-GV1Q50JX1X";
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "3281655158675256";

/** Our names for the moments that matter, sent to both Google (GA4) and Meta. */
export type TrackEvent =
  | "sign_up"
  | "login"
  | "onboarding_complete"
  | "start_training"
  | "lesson_complete"
  | "contact"
  | "share";

/** Cookie a server action uses to hand an event to the browser across a redirect. */
export const EVENT_COOKIE = "ck_ev";

/**
 * GA4 name and Meta name for each event. Meta standard events (CompleteRegistration, Lead, Contact)
 * can be used to optimise ads; the rest are custom events (good for audiences and retargeting).
 */
export const EVENT_MAP: Record<
  TrackEvent,
  { ga: string; meta: string; metaStandard: boolean }
> = {
  sign_up: { ga: "sign_up", meta: "CompleteRegistration", metaStandard: true },
  login: { ga: "login", meta: "Login", metaStandard: false },
  onboarding_complete: { ga: "onboarding_complete", meta: "Lead", metaStandard: true },
  start_training: { ga: "start_training", meta: "StartTraining", metaStandard: false },
  lesson_complete: { ga: "lesson_complete", meta: "LessonComplete", metaStandard: false },
  contact: { ga: "contact", meta: "Contact", metaStandard: true },
  share: { ga: "share", meta: "Share", metaStandard: false },
};

/** Pages never tracked: staff admin, sign-in callbacks and dev tools. */
export const isUntrackedPath = (path: string) =>
  /^\/(admin|auth|dev|api)(\/|$)/.test(path);
