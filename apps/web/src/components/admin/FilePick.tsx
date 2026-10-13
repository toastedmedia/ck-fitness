"use client";
import { useState, type ChangeEvent, type Ref } from "react";

/** A clear "Choose ..." button that opens the file picker, with the chosen file's name beside it. */
export function FilePick({
  name,
  id,
  accept,
  label = "Choose file",
  disabled,
  onChange,
  showName = true,
  inputRef,
}: {
  name?: string;
  id?: string;
  accept?: string;
  label?: string;
  disabled?: boolean;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  showName?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [picked, setPicked] = useState("");
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label
        className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border-2 border-brand bg-brand px-4 text-sm font-bold text-on-brand focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent hover:bg-brand-soft ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4 fill-none stroke-current"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
        </svg>
        {label}
        <input
          ref={inputRef}
          type="file"
          id={id}
          name={name}
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            setPicked(e.target.files?.[0]?.name ?? "");
            onChange?.(e);
          }}
        />
      </label>
      {showName ? (
        <span className="max-w-56 truncate text-xs font-normal text-muted">
          {picked || "Nothing chosen yet"}
        </span>
      ) : null}
    </span>
  );
}
