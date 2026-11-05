// Item size: one tap on a preset, or type the litres. Domain decision (T1):
// presets map to litres and the item stores litres.
import { useId } from "react";
import { cx } from "../cx";
import { formatLitres, parseLitres, presetFor, SIZE_PRESETS } from "../items/size";
import { TextField } from "./TextField";

export function SizePicker({ litres, onChange, error }: { litres: string; onChange: (draft: string) => void; error?: string }) {
  const id = useId();
  const selected = presetFor(parseLitres(litres));
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${id}-error` : undefined}>
      <legend className="mb-1 text-sm font-medium">Size of one</legend>
      <div role="radiogroup" aria-label="Size preset" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SIZE_PRESETS.map((p) => {
          const on = p === selected;
          return (
            <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(String(p.litres))}
              className={cx(
                "flex min-h-touch flex-col items-start rounded-md border px-3 py-2 text-left",
                "focus-visible:outline-2 focus-visible:outline-accent",
                on ? "border-accent bg-accent-tint" : "border-border bg-surface hover:border-accent",
              )}>
              <span className="font-medium">{p.label}</span>
              <span className="text-sm text-muted">{formatLitres(p.litres)} · {p.example}</span>
            </button>
          );
        })}
      </div>
      <TextField label="Or litres" inputMode="decimal" suffix="L" value={litres} onChange={onChange}
        placeholder="e.g. 25" />
      {error && <p id={`${id}-error`} className="text-sm text-error">{error}</p>}
    </fieldset>
  );
}
