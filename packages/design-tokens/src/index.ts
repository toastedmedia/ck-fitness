/**
 * Raw copy of the colour roles for non-CSS consumers (the Phase 2 mobile app).
 * The web app's source of truth is theme.css; a test keeps the two in sync.
 */
export const colors = {
  brand: "#1b1b36",
  brandSoft: "#2a2a4a",
  onBrand: "#ffffff",
  accent: "#c8a84b",
  accentStrong: "#8a6d1a",
  onAccent: "#1b1b36",
  page: "#f3f4f9",
  surface: "#ffffff",
  line: "#dfe2ec",
  text: "#1b1b36",
  textMuted: "#5b6075",
  success: "#1f8a4c",
  successSoft: "#e6f6ec",
  danger: "#b3402f",
} as const;

/** Minimum touch target in px. */
export const minTapTarget = 48;
