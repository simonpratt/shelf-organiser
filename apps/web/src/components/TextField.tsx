// Labelled text input or textarea with hint and inline error.
import { useId, type InputHTMLAttributes, type Ref } from "react";
import { cx } from "../cx";

type Props = Omit<InputHTMLAttributes<HTMLInputElement & HTMLTextAreaElement>, "onChange"> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  multiline?: boolean;
  /** Text after the input, inside its border, e.g. a unit. */
  suffix?: string;
  ref?: Ref<HTMLInputElement & HTMLTextAreaElement>;
};

export const inputClasses =
  "w-full min-h-touch rounded-md border bg-surface px-3 py-2 text-base text-text placeholder:text-muted " +
  "focus:outline-2 focus:outline-accent focus:border-accent";

export function TextField({ label, value, onChange, hint, error, multiline, suffix, className, ref, ...rest }: Props) {
  const id = useId();
  const describedBy = cx(hint && `${id}-hint`, error && `${id}-error`) || undefined;
  const common = {
    id,
    value,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    className: cx(inputClasses, error ? "border-error" : "border-border", suffix && "pr-10", className),
    ref,
    ...rest,
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <div className="relative">
        {multiline ? <textarea rows={3} {...common} /> : <input {...common} />}
        {suffix && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
