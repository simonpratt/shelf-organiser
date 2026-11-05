// Search box for the item list, with a clear button.
import { useId } from "react";
import { cx } from "../cx";
import { CloseIcon, SearchIcon } from "./icons";
import { inputClasses } from "./TextField";

export function SearchField({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">{label}</label>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted"><SearchIcon /></span>
      <input id={id} type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className={cx(inputClasses, "border-border pl-10 pr-12 [&::-webkit-search-cancel-button]:hidden")} />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")}
          className="absolute inset-y-0 right-0 flex min-w-touch items-center justify-center text-muted hover:text-text">
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
