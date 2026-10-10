/**
 * CK visual language. Single source of truth for colours and sizing; the web app's
 * globals.css mirrors these values (a test keeps them in sync) and the Phase 2 mobile
 * app will import this file directly.
 */
export const colors = {
  green: { 900: "#0f3d2e", 800: "#14513c", 700: "#1b6b4e", 100: "#e3efe9" },
  cream: { 50: "#fbf8f1", 100: "#f4efe3", 200: "#e8e0cd" },
  gold: { 600: "#a8801f", 500: "#c9a13b", 100: "#f6ecd0" },
  ink: { 900: "#1c2420", 600: "#4a5650" },
  danger: "#a33a2f",
  white: "#ffffff",
} as const;

/** Minimum touch target in px (WCAG 2.2 AA is 24; we go larger for gym-floor thumbs). */
export const minTapTarget = 48;
