// A tag shown as its path, e.g. "Location › Shed": removable when chosen,
// or, for a tag Claude proposes (T5), a dashed chip that adds it when
// tapped. "New" marks a tag that doesn't exist yet and would be created.
import { cx } from "../cx";
import { formatPath, type TagPath } from "../tags/path";
import { CloseIcon, PlusIcon } from "./icons";

type Props = { path: TagPath; isNew?: boolean; onRemove?: () => void; onAdd?: () => void };

function NewBadge() {
  return <span className="shrink-0 rounded-full bg-surface-raised px-1.5 text-xs font-medium text-accent">New</span>;
}

export function TagChip({ path, isNew = false, onRemove, onAdd }: Props) {
  const text = formatPath(path);
  if (onAdd) {
    return (
      <button type="button" onClick={onAdd} aria-label={`Add tag ${text}${isNew ? " (new)" : ""}`}
        className="inline-flex min-h-touch max-w-full items-center gap-1.5 rounded-full border border-dashed border-accent px-3 text-sm text-text hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-accent">
        <span className="shrink-0 text-accent"><PlusIcon /></span>
        <span className="truncate">{text}</span>
        {isNew && <NewBadge />}
      </button>
    );
  }
  return (
    <span className={cx("inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent-tint pl-3 text-sm text-text",
      onRemove ? "pr-0" : "py-1 pr-3")}>
      <span className="truncate">{text}</span>
      {isNew && <NewBadge />}
      {onRemove && (
        <button type="button" aria-label={`Remove tag ${text}`} onClick={onRemove}
          className="-ml-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:text-text">
          <CloseIcon />
        </button>
      )}
    </span>
  );
}
