"use client";

import type { SelectHTMLAttributes } from "react";

/** A dropdown that saves as soon as a new option is picked (with a plain Save button for no-JS). */
export function AutoSubmitSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      onChange={(e) => {
        props.onChange?.(e);
        e.currentTarget.form?.requestSubmit();
      }}
    />
  );
}
