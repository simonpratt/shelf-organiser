// The space map (T3, nested in T4): a windirstat-style squarified treemap,
// area proportional to total space. Each block at the current level shows
// its contents laid out again inside it, down to the items, so the big
// things show at a glance. Only the top blocks are tap targets (a tag drills
// in, an item opens); the tiles inside them are part of that target. Tags
// are tinted and marked "›", items are plain, Untagged is dashed, so the
// kind never rests on colour alone. It is hidden from screen readers and
// skipped by the keyboard: the SpaceRow list beside it is the accessible
// view of the top blocks, with the same links.
import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { cx } from "../cx";
import { formatLitres } from "../items/size";
import { formatShare, type Block, type BlockKind } from "../space/breakdown";
import { nest } from "../space/nest";

const kinds: Partial<Record<BlockKind, { fill: string; inner: string; legend: string }>> = {
  tag: { fill: "bg-accent-tint border-accent/40", inner: "border-accent/40", legend: "Tag" },
  item: { fill: "bg-surface-raised border-border", inner: "bg-surface-raised border-border", legend: "Item" },
  untagged: { fill: "bg-surface border-dashed border-muted", inner: "border-dashed border-muted", legend: "Untagged" },
};

type Props = {
  /** The blocks at the current level, each with its contents. */
  blocks: Block[];
  /** What a top block links to. */
  linkTo: (b: Block) => string;
};

export function Treemap({ blocks, linkTo }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const total = blocks.reduce((s, b) => s + b.litres, 0);
  const tiles = nest(blocks, { x: 0, y: 0, ...size });
  const present = Object.entries(kinds).filter(([k]) => tiles.some((t) => t.block.kind === k));
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <div ref={ref} className="relative aspect-square max-h-[60svh] w-full" data-testid="space-map">
        {tiles.map(({ key, block: b, depth, rect: r, labelled }) => {
          const style = { left: r.x, top: r.y, width: r.w, height: r.h };
          if (depth > 0) {
            return (
              <div key={key} style={style} className={cx("pointer-events-none absolute overflow-hidden rounded-sm border px-1 py-0.5",
                kinds[b.kind]?.inner)}>
                {labelled && (
                  <>
                    <span className="block truncate text-xs font-medium">{b.name}</span>
                    <span className="block truncate text-xs text-muted tabular-nums">{formatLitres(b.litres)}</span>
                  </>
                )}
              </div>
            );
          }
          const share = formatShare(b.litres, total);
          return (
            <Link key={key} to={linkTo(b)} tabIndex={-1} title={`${b.name}: ${formatLitres(b.litres)}, ${share}`} style={style}
              className={cx("absolute flex flex-col overflow-hidden rounded-sm border px-1.5 pt-1 text-left hover:border-accent",
                kinds[b.kind]?.fill)}>
              {labelled && (
                <>
                  <span className="truncate text-sm font-medium">{b.name}{b.kind !== "item" && " ›"}</span>
                  <span className="truncate text-xs text-muted tabular-nums">{formatLitres(b.litres)} · {share}</span>
                </>
              )}
            </Link>
          );
        })}
      </div>
      {present.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {present.map(([k, v]) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={cx("size-3 rounded-sm border", v.fill)} />{v.legend}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
