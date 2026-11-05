// One tag in the tag tree, indented by depth, with the item count and total
// space of everything inside it. Top-level tags are dimensions (Location,
// Type) and are shown bolder.
import { cx } from "../cx";
import { formatLitres } from "../items/size";
import { ChevronIcon, TagIcon } from "./icons";

type Props = { name: string; depth: number; itemCount: number; totalSpace: number; onSelect: () => void };

export function TagTreeRow({ name, depth, itemCount, totalSpace, onSelect }: Props) {
  return (
    <button type="button" onClick={onSelect} style={{ paddingLeft: `calc(var(--spacing) * ${4 + depth * 5})` }}
      className="flex min-h-touch w-full items-center gap-2 border-b border-border pr-3 text-left hover:bg-surface">
      <span className="text-muted"><TagIcon /></span>
      <span className={cx("min-w-0 flex-1 truncate", depth === 0 && "font-semibold")}>{name}</span>
      <span className="text-right text-sm text-muted">
        {itemCount === 1 ? "1 item" : `${itemCount} items`}
        {itemCount > 0 && <> · {formatLitres(totalSpace)}</>}
      </span>
      <span className="text-muted"><ChevronIcon /></span>
      <span className="sr-only">Edit</span>
    </button>
  );
}
