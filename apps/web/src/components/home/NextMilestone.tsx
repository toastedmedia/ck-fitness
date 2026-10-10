import { dismissMilestones } from "@/app/(app)/actions";
import { Card } from "@/components/app/ui";

const Trophy = () => (
  <svg
    viewBox="0 0 24 24"
    className="size-5 shrink-0 fill-none stroke-accent-strong"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8 4h8v5a4 4 0 01-8 0z" />
    <path d="M8 6H5v1a3 3 0 003 3M16 6h3v1a3 3 0 01-3 3" />
    <path d="M12 13v4M9 20h6M10 17h4" />
  </svg>
);

/** One milestone at a time: a newly earned one first, otherwise the next thing to aim for. */
export function NextMilestone({
  text,
  earned,
}: {
  text: string | null;
  earned: { title: string; body: string } | null;
}) {
  if (!text && !earned) return null;
  return (
    <Card className="flex items-center gap-3 py-3">
      <Trophy />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-accent-strong">
          {earned ? "Milestone earned" : "Next Milestone"}
        </p>
        <p className="text-[13px] font-semibold leading-snug text-brand">
          {earned ? `${earned.title}. ${earned.body}` : text}
        </p>
      </div>
      {earned ? (
        <form action={dismissMilestones}>
          <button className="min-h-10 rounded-button bg-brand px-3 text-xs font-bold text-on-brand">
            Thanks
          </button>
        </form>
      ) : null}
    </Card>
  );
}
