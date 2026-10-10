import { bmiLabel } from "@ck/core";
import { toggleBmi } from "@/app/(app)/actions";

/** BMI is information only, so it stays a slim, quiet row under the weight card. */
export function BMIWidget({ bmi, hidden }: { bmi: number | null; hidden: boolean }) {
  return (
    <section
      aria-label="BMI"
      className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-2.5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-accent-strong">
          BMI
        </p>
        {hidden || bmi === null ? (
          <p className="text-xs text-muted">
            {hidden ? "Hidden. You can show it any time." : "Log a weight to see this."}
          </p>
        ) : (
          <p className="text-sm font-bold text-brand">
            <span className="tabular-nums">{bmi}</span>{" "}
            <span className="text-xs font-semibold text-muted">
              · {bmiLabel(bmi).replace("range", "Range")}
            </span>
          </p>
        )}
        <p className="text-[10px] text-muted">Information only. Not a diagnosis.</p>
      </div>
      <form action={toggleBmi}>
        <button className="min-h-10 px-1 text-[11px] font-bold text-brand underline underline-offset-4">
          {hidden ? "Show" : "Hide"}
        </button>
      </form>
    </section>
  );
}
