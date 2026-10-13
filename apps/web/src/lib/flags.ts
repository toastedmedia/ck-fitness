/** Later-phase features stay off until their phase ships (Build Guide §1). */
export const flags = {
  community: false,
  aiCoach: false,
  nutrition: false,
  /** Apple Health needs the native iPhone app (Phase 2). Flip to true when it ships. */
  apple_health_enabled: false,
  /** While Apple Health is not ready, show a small "Coming in Phase 2" card. Set false to hide it entirely. */
  show_apple_health_preview: true,
  progressPhotos: true,
} as const;
