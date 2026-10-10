import { flags } from "@/lib/flags";
import { Pill } from "@/components/app/ui";

/** Quiet placeholder until the iPhone app ships. Controlled by flags in lib/flags.ts. */
export function AppleHealthPreview() {
  if (flags.apple_health_enabled || !flags.show_apple_health_preview) return null;
  return (
    <div className="flex items-center gap-3 rounded-card border-2 border-dashed border-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <b className="block text-xs text-brand">Apple Health</b>
        <p className="text-[11px] text-muted">Automatic steps &amp; activity tracking</p>
      </div>
      <Pill tone="navy">Coming in Phase 2</Pill>
    </div>
  );
}
