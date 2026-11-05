// Quantity with − / + buttons and a typed draft, for "how many of these".
import { useId } from "react";
import { cx } from "../cx";
import { MinusIcon, PlusIcon } from "./icons";
import { inputClasses } from "./TextField";

export function QuantityStepper({ value, onChange, error }: { value: string; onChange: (draft: string) => void; error?: string }) {
  const id = useId();
  const n = Number(value);
  const step = (d: number) => onChange(String(Math.max(1, (Number.isInteger(n) ? n : 1) + d)));
  const btn = "flex min-h-touch min-w-touch items-center justify-center rounded-md border border-border bg-surface-raised hover:border-accent disabled:opacity-50";
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">Quantity</label>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} aria-label="One fewer" disabled={n <= 1} onClick={() => step(-1)}><MinusIcon /></button>
        <input id={id} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
          className={cx(inputClasses, "w-20 text-center", error ? "border-error" : "border-border")} />
        <button type="button" className={btn} aria-label="One more" onClick={() => step(1)}><PlusIcon /></button>
      </div>
      {error && <p id={`${id}-error`} className="text-sm text-error">{error}</p>}
    </div>
  );
}
