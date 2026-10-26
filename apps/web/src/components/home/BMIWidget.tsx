/** BMI: just the number. */
export function BMIWidget({ bmi }: { bmi: number | null }) {
  return (
    <section
      aria-label="BMI"
      className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-2.5"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-accent-strong">
        BMI
      </p>
      <p className="text-sm font-bold text-brand">
        {bmi === null ? (
          <span className="text-xs font-normal text-muted">
            Log a weight to see this.
          </span>
        ) : (
          <span className="tabular-nums">{bmi}</span>
        )}
      </p>
    </section>
  );
}
