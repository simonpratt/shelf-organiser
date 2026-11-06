// Tag field for an item: chips for the chosen tags, and a combobox that
// suggests existing tags or creates a new path typed as "Type/Camping/Tents".
// Domain decision (T1): users create nested tags inline while tagging. With
// the Location dimension given, a new name typed after removing a location
// tag ("Shelf 3" after "Location › Shed › Shelf 1") is offered there first.
import { useId, useState, type KeyboardEvent } from "react";
import { cx } from "../cx";
import { addTag, hasTagIn } from "../items/form";
import { formatPath, suggestTags, type Suggestion, type TagPath } from "../tags/path";
import { isNewPath } from "../tags/proposals";
import { PlusIcon, TagIcon } from "./icons";
import { TagChip } from "./TagChip";
import { inputClasses } from "./TextField";

type Props = {
  value: TagPath[];
  onChange: (tags: TagPath[]) => void;
  draft: string;
  onDraftChange: (text: string) => void;
  /** Every existing tag path, for suggestions and to mark chosen tags New. */
  existing: TagPath[];
  label?: string;
  /** The Location dimension, if known. */
  location?: string | null;
};

export function TagInput({ value, onChange, draft, onDraftChange, existing, label = "Tags", location = null }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Where the last location tag removed was, e.g. "Location › Shed" for its Shelf 1.
  const [lastPlace, setLastPlace] = useState<TagPath>([]);
  const near = value.some((t) => hasTagIn([t], location)) ? [] : lastPlace;
  const suggestions = suggestTags(existing, draft, value, near);
  const remove = (p: TagPath) => {
    if (hasTagIn([p], location) && p.length > 1) setLastPlace(p.slice(0, -1));
    onChange(value.filter((t) => t !== p));
  };
  const shown = open && suggestions.length > 0;

  const pick = (s: Suggestion) => {
    onChange(addTag(value, s.path));
    onDraftChange("");
    setActive(0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + d + suggestions.length) % Math.max(suggestions.length, 1));
    } else if (e.key === "Enter" && draft.trim() !== "") {
      e.preventDefault(); // add the tag rather than submit the form
      const s = suggestions[active] ?? suggestions[0];
      if (s) pick(s);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      remove(value[value.length - 1]!);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {value.length > 0 && (
        <ul aria-label={`Chosen ${label.toLowerCase()}`} className="flex flex-wrap gap-2 pb-1">
          {value.map((p) => (
            <li key={formatPath(p)} className="max-w-full">
              <TagChip path={p} isNew={isNewPath(p, existing)} onRemove={() => remove(p)} />
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <input id={id} role="combobox" aria-expanded={shown} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={shown ? `${id}-opt-${active}` : undefined} aria-describedby={`${id}-hint`}
          autoComplete="off" autoCapitalize="words" enterKeyHint="enter" value={draft}
          placeholder="Search or type a new path"
          onChange={(e) => { onDraftChange(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={onKeyDown}
          className={cx(inputClasses, "border-border")} />
        {shown && (
          <ul id={`${id}-list`} role="listbox" aria-label="Tag suggestions"
            className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface-raised shadow-lg">
            {suggestions.map((s, i) => (
              <li key={(s.isNew ? "new:" : "") + formatPath(s.path)} id={`${id}-opt-${i}`} role="option" aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}
                className={cx("flex min-h-touch cursor-pointer items-center gap-2 px-3", i === active && "bg-accent-tint")}>
                <span className="text-muted">{s.isNew ? <PlusIcon /> : <TagIcon />}</span>
                <span className="truncate">{s.isNew ? `Create “${formatPath(s.path)}”` : formatPath(s.path)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p id={`${id}-hint`} className="text-sm text-muted">Use / to nest, e.g. Location/Shed/Shelf 2</p>
    </div>
  );
}
