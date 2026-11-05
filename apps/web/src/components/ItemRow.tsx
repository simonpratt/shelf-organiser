// One item in the list: name, quantity × size, total space and tags. Taps
// through to the edit screen.
import { Link } from "react-router";
import { formatLitres, totalLitres } from "../items/size";
import type { TagPath } from "../tags/path";
import { ChevronIcon } from "./icons";
import { TagChip } from "./TagChip";

type Props = { to: string; name: string; litres: number; quantity: number; tags: { id: number; path: TagPath }[] };

export function ItemRow({ to, name, litres, quantity, tags }: Props) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 hover:border-accent">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate font-medium">{name}</span>
          <span className="shrink-0 font-mono">{formatLitres(totalLitres({ litres, quantity }))}</span>
        </div>
        {quantity > 1 && <span className="text-sm text-muted">{quantity} × {formatLitres(litres)}</span>}
        {tags.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {tags.map((t) => <TagChip key={t.id} path={t.path} />)}
          </span>
        )}
      </div>
      <span className="text-muted"><ChevronIcon /></span>
    </Link>
  );
}
