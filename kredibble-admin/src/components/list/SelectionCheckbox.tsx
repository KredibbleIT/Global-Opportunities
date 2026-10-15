"use client";

/**
 * SelectionCheckbox: the small checkbox in a table row (and in the header, to select a whole page). A native checkbox, so the
 * keyboard and screen readers work, restyled like the form Checkbox (purple fill with a white check, never orange).
 *
 * Props: checked, indeterminate? (some but not all selected: shows a dash and sets aria-checked="mixed"), onChange(checked),
 *        label (the accessible name, for example "Select Ama Mensah").
 */
import { useEffect, useRef } from "react";
import { Check, Minus } from "lucide-react";

interface SelectionCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export function SelectionCheckbox({ checked, indeterminate = false, onChange, label }: SelectionCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <span className="relative inline-flex size-5 shrink-0 align-middle">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        aria-label={label}
        aria-checked={indeterminate ? "mixed" : checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer size-5 cursor-pointer appearance-none rounded-inset border border-input bg-surface transition-colors checked:border-purple-600 checked:bg-purple-600 indeterminate:border-purple-600 indeterminate:bg-purple-600"
      />
      {indeterminate ? (
        <Minus size={14} strokeWidth={3} aria-hidden="true" className="pointer-events-none absolute inset-0 m-auto text-white" />
      ) : (
        <Check size={14} strokeWidth={3} aria-hidden="true" className="pointer-events-none absolute inset-0 m-auto text-white opacity-0 peer-checked:opacity-100" />
      )}
    </span>
  );
}
