import { useId } from "react";

const inputClass =
  "min-h-12 w-full rounded-2xl border-2 border-line bg-surface px-4 text-base text-ink placeholder:text-muted focus:border-brand";

export function Field({
  label,
  hint,
  error,
  ...input
}: {
  label: string;
  hint?: string;
  error?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        id={id}
        className={inputClass}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
        {...input}
      />
      {hint && !error ? (
        <p id={`${id}-h`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-e`} role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextArea({
  label,
  error,
  ...input
}: {
  label: string;
  error?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <textarea id={id} rows={3} className={`${inputClass} py-3`} {...input} />
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
