"use client";

export type Option = readonly [value: string, label: string];

/** Tap-to-choose buttons. Single choice by default, multiple when `multi` is set. */
export function ChipGroup({
  label,
  options,
  value,
  onChange,
  multi = false,
  max,
  error,
}: {
  label: string;
  options: readonly Option[];
  value: string | string[];
  onChange: (next: string | string[]) => void;
  multi?: boolean;
  max?: number;
  error?: string;
}) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const toggle = (v: string) => {
    if (!multi) return onChange(v);
    if (selected.includes(v)) return onChange(selected.filter((s) => s !== v));
    if (max && selected.length >= max) return;
    onChange([...selected, v]);
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, text]) => {
          const on = selected.includes(v);
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(v)}
              className={`min-h-11 rounded-chip border-2 px-4 text-sm font-semibold ${
                on
                  ? "border-brand bg-brand text-on-brand"
                  : "border-line bg-surface text-ink"
              }`}
            >
              {text}
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
