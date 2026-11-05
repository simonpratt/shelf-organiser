// Labelled native select: the phone's own picker is the fastest on mobile.
import { useId } from "react";
import { cx } from "../cx";
import { inputClasses } from "./TextField";

export type Option = { value: string; label: string };

export function Select({ label, value, onChange, options, hideLabel, hint }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  hideLabel?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={cx("text-sm font-medium", hideLabel && "sr-only")}>{label}</label>
      <select id={id} value={value} aria-describedby={hint ? `${id}-hint` : undefined} onChange={(e) => onChange(e.target.value)} className={cx(inputClasses, "border-border")}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p>}
    </div>
  );
}
