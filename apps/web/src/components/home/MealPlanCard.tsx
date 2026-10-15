import Link from "next/link";
import { Card, Cap } from "@/components/app/ui";

/** A small card that opens the member's meal plan. `title` is the live plan, if there is one. */
export function MealPlanCard({ title, diet }: { title: string | null; diet?: string }) {
  return (
    <Card>
      <Cap>Meal plan</Cap>
      <p className="mt-1 text-sm font-bold text-brand">
        {title ?? "See what to eat each week"}
      </p>
      <p className="text-xs text-muted">
        {title
          ? `${diet ?? ""} plan with portion sizes.`.trim()
          : "Vegetarian and non-vegetarian plans from your coach."}
      </p>
      <Link
        href="/accountability/diet"
        className="mt-2 inline-flex min-h-11 items-center rounded-button border-2 border-line px-4 text-xs font-bold text-brand"
      >
        Open meal plan
      </Link>
    </Card>
  );
}
