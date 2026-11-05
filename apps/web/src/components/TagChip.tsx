// A tag shown as its path, e.g. "Location › Shed", optionally removable.
import { formatPath, type TagPath } from "../tags/path";
import { CloseIcon } from "./icons";

export function TagChip({ path, onRemove }: { path: TagPath; onRemove?: () => void }) {
  const text = formatPath(path);
  return (
    <span className="inline-flex max-w-full items-center rounded-full bg-accent-tint text-sm text-text">
      <span className="truncate py-1 pl-3 pr-3 has-[+button]:pr-0">{text}</span>
      {onRemove && (
        <button type="button" aria-label={`Remove tag ${text}`} onClick={onRemove}
          className="flex size-8 items-center justify-center rounded-full text-muted hover:text-text">
          <CloseIcon />
        </button>
      )}
    </span>
  );
}
