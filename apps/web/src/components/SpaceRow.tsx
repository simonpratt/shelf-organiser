// One block of the space breakdown as a list row (T3): name, total space,
// share of the level above with a bar to match, and a chevron. A tag or
// Untagged drills in; an item opens its edit screen. This list is the text
// and screen-reader view of the Treemap.
import { Link } from "react-router";
import { cx } from "../cx";
import { formatLitres } from "../items/size";
import type { BlockKind } from "../space/breakdown";
import { BoxIcon, ChevronIcon, TagIcon, UntaggedIcon } from "./icons";

type Props = { to: string; kind: BlockKind; name: string; litres: number; itemCount: number; share: string; fraction: number };

export function SpaceRow({ to, kind, name, litres, itemCount, share, fraction }: Props) {
  const isItem = kind === "item";
  return (
    <Link to={to} className="flex min-h-touch items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 hover:border-accent"
      aria-label={`${name}, ${formatLitres(litres)}, ${share}${isItem ? "" : `, ${itemCount === 1 ? "1 item" : `${itemCount} items`}`}`}>
      <span className="text-muted">{isItem ? <BoxIcon /> : kind === "untagged" ? <UntaggedIcon /> : <TagIcon />}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className={cx("truncate", !isItem && "font-medium")}>{name}</span>
          <span className="shrink-0 text-sm tabular-nums">
            {formatLitres(litres)} <span className="text-muted">· {share}</span>
          </span>
        </span>
        <span className="h-1 overflow-hidden rounded-full bg-surface-raised">
          <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(fraction * 100, 1)}%` }} />
        </span>
        {!isItem && <span className="text-xs text-muted">{itemCount === 1 ? "1 item" : `${itemCount} items`}</span>}
      </span>
      <span className="text-muted"><ChevronIcon /></span>
    </Link>
  );
}
