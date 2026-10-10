/** 1 to 5 choice using real radio buttons, so it works with keyboard and screen readers. */
export function Scale({
  name,
  label,
  low,
  high,
  defaultValue,
}: {
  name: string;
  label: string;
  low: string;
  high: string;
  defaultValue?: number;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-xs font-bold text-brand">{label}</legend>
      <div className="grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="relative">
            <input
              type="radio"
              name={name}
              value={n}
              defaultChecked={defaultValue === n}
              required
              className="peer sr-only"
            />
            <span className="grid min-h-11 cursor-pointer place-items-center rounded-2xl border-2 border-line bg-surface text-sm font-bold peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-accent">
              {n}
            </span>
          </label>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </fieldset>
  );
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function DayPicker({ selected }: { selected: number[] }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-xs font-bold text-brand">Training days</legend>
      <div className="grid grid-cols-7 gap-1">
        {DAY_LABELS.map((d, i) => (
          <label key={d} className="relative">
            <input
              type="checkbox"
              name="days"
              value={i}
              defaultChecked={selected.includes(i)}
              className="peer sr-only"
            />
            <span className="grid min-h-11 cursor-pointer place-items-center rounded-2xl border-2 border-line bg-surface text-[11px] font-bold peer-checked:border-brand peer-checked:bg-brand peer-checked:text-on-brand peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-accent">
              {d}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
