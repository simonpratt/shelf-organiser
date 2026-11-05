// The space map (T3): a windirstat-style squarified treemap of one level of
// blocks, area proportional to total space. Tags are tinted and marked "›"
// (tap to drill in), items are plain, Untagged is dashed, so the kind never
// rests on colour alone. It is hidden from screen readers and skipped by the
// keyboard: the SpaceRow list beside it is the accessible view of the same
// blocks, with the same links, and covers blocks too small to label.
import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { cx } from "../cx";
import { formatLitres } from "../items/size";
import type { BlockKind } from "../space/breakdown";
import { squarify } from "../space/squarify";

export type MapBlock = { key: string; kind: BlockKind; name: string; litres: number; share: string; to: string };

const kinds: Partial<Record<BlockKind, { fill: string; legend: string }>> = {
  tag: { fill: "bg-accent-tint border-accent/40", legend: "Tag" },
  item: { fill: "bg-surface-raised border-border", legend: "Item" },
  untagged: { fill: "bg-surface border-dashed border-muted", legend: "Untagged" },
};
/** Blocks smaller than this (px) are left unlabelled; the list has them. */
const LABEL_MIN = { w: 64, h: 40 };

export function Treemap({ blocks }: { blocks: MapBlock[] }) {
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

  const rects = squarify(blocks.map((b) => b.litres), { x: 0, y: 0, ...size });
  const present = Object.entries(kinds).filter(([k]) => blocks.some((b) => b.kind === k));
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <div ref={ref} className="relative aspect-square w-full" data-testid="space-map">
        {blocks.map((b, i) => {
          const r = rects[i];
          if (!r || r.w < 2 || r.h < 2) return null;
          const labelled = r.w >= LABEL_MIN.w && r.h >= LABEL_MIN.h;
          return (
            // A 1px inset on every side leaves a 2px gap of page between blocks.
            <Link key={b.key} to={b.to} tabIndex={-1} title={`${b.name}: ${formatLitres(b.litres)}, ${b.share}`}
              style={{ left: r.x + 1, top: r.y + 1, width: r.w - 2, height: r.h - 2 }}
              className={cx("absolute flex flex-col overflow-hidden rounded-sm border p-1.5 text-left hover:border-accent",
                kinds[b.kind]?.fill)}>
              {labelled && (
                <>
                  <span className="line-clamp-2 text-sm font-medium break-words">
                    {b.name}{b.kind !== "item" && " ›"}
                  </span>
                  <span className="truncate text-xs text-muted tabular-nums">{formatLitres(b.litres)} · {b.share}</span>
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
