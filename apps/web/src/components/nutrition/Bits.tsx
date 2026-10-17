import Link from "next/link";
import { Card, Cap } from "@/components/app/ui";

/** A thin progress bar. The value is also written out, so it never relies on colour alone. */
export function Bar({ pct, label }: { pct: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full bg-page"
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Shown to free members on the web, and inside the store apps (where it never mentions price or buying). */
export function LockedNutrition({ native }: { native: boolean }) {
  return (
    <Card className="bg-page">
      <Cap>CK Membership</Cap>
      <h2 className="mt-1 text-[15px] font-bold text-brand">
        Nutrition tracking is part of CK Membership
      </h2>
      <p className="mt-1 text-xs">
        Snap a photo of your meal, get an estimate of calories and protein, and see your
        day add up.
      </p>
      {native ? (
        <p className="mt-2 text-xs font-bold text-brand">Available with CK Membership.</p>
      ) : (
        <Link
          href="/membership"
          className="mt-3 inline-flex min-h-11 items-center rounded-button bg-brand px-4 text-xs font-bold text-on-brand"
        >
          See CK Membership
        </Link>
      )}
    </Card>
  );
}
