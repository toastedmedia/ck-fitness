import Link from "next/link";
import type { AttentionItem } from "@ck/core";
import { ActionButton } from "@/components/app/ActionButton";
import { Card } from "@/components/app/ui";
import { completeWorkout } from "@/app/(app)/actions";
import { MissedWorkoutRow } from "./MissedWorkoutRow";

const cta =
  "inline-flex min-h-10 shrink-0 items-center rounded-button bg-brand px-4 text-xs font-bold text-on-brand";

/**
 * One compact card for everything that needs her attention. It renders any AttentionItem, so new
 * alert types (payment, trainer message, program ending...) need no layout work. Hidden when empty.
 */
export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card className="border-[#ecdca4] bg-[#fbf5e1] p-3">
      <h2 className="px-1 pb-1 text-[11px] font-bold uppercase tracking-[0.1em] text-accent-strong">
        Needs Attention
      </h2>
      <ul className="flex flex-col divide-y divide-[#ecdca4]">
        {items.map((item) =>
          item.cta.action === "missed_recovery" && item.ref ? (
            <li key={item.id} className="py-2">
              <MissedWorkoutRow
                actionId={item.ref}
                title={item.title}
                detail={item.detail}
              />
            </li>
          ) : (
            <li key={item.id} className="flex items-center gap-3 px-1 py-2">
              <div className="min-w-0 flex-1">
                <b className="block text-[13px] leading-snug text-brand">{item.title}</b>
                <span
                  className={`text-[11.5px] ${item.severity === "warning" ? "font-semibold text-danger" : "text-muted"}`}
                >
                  {item.detail}
                </span>
              </div>
              {item.cta.href ? (
                <Link href={item.cta.href} className={cta}>
                  {item.cta.label}
                </Link>
              ) : item.cta.action === "start_workout" ? (
                <ActionButton variant="primary" run={completeWorkout}>
                  Mark done
                </ActionButton>
              ) : null}
            </li>
          ),
        )}
      </ul>
    </Card>
  );
}
