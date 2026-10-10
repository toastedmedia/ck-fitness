"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CHECKIN_FIELDS, type CheckinField } from "@ck/core";
import { saveDailyCheckin } from "@/app/(app)/actions";

/** The 15-second daily check-in as a native dialog (focus trap and Escape come for free). */
export function CheckinSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [answers, setAnswers] = useState<Partial<Record<CheckinField, string>>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const save = () =>
    start(async () => {
      const r = await saveDailyCheckin({ ...answers, note });
      if (r.error) return setError(r.error);
      setError(undefined);
      onSaved();
      onClose();
    });

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="checkin-title"
      className="m-auto w-[min(92vw,26rem)] rounded-card border border-line bg-surface p-0 text-ink backdrop:bg-black/50 max-sm:mb-0 max-sm:mt-auto max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="checkin-title" className="text-base font-bold text-brand">
              How are you feeling today?
            </h2>
            <p className="text-xs text-muted">Takes about 15 seconds.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 place-items-center rounded-full text-lg text-muted"
          >
            ×
          </button>
        </div>
        {(Object.keys(CHECKIN_FIELDS) as CheckinField[]).map((field) => (
          <fieldset key={field} className="flex flex-col gap-1.5">
            <legend className="text-xs font-bold text-brand">
              {CHECKIN_FIELDS[field].label}
            </legend>
            <div className="flex gap-1.5">
              {CHECKIN_FIELDS[field].options.map(([value, label]) => {
                const on = answers[field] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAnswers((a) => ({ ...a, [field]: value }))}
                    className={`min-h-11 flex-1 rounded-2xl border-2 px-1 text-xs font-bold ${on ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
        <label className="text-xs font-bold text-brand">
          Anything CK should know today?{" "}
          <span className="font-normal text-muted">(optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={300}
            className="mt-1 w-full rounded-2xl border-2 border-line bg-surface p-3 text-sm font-normal"
          />
        </label>
        {error ? (
          <p role="alert" className="text-xs font-semibold text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="min-h-12 rounded-button bg-brand text-sm font-bold text-on-brand disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save check-in"}
        </button>
      </div>
    </dialog>
  );
}
