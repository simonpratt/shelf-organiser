// The nested space map layout (T4): windirstat style, each block at the
// current level is squarified, then its contents are squarified again inside
// it, down to the items, so the biggest items show at a glance without
// drilling in. Only the top blocks are tappable and carry a header; inner tag
// blocks are bare frames and inner items are labelled when they fit.
import type { Block } from "./breakdown";
import { squarify, type Rect } from "./squarify";

export type Tile = {
  key: string;
  block: Block;
  /** 0 for the blocks at the current level, which are the tap targets. */
  depth: number;
  /** Where to draw it, in px, gaps already taken off. */
  rect: Rect;
  /** Whether there is room for its name and size. */
  labelled: boolean;
};

/** Gap between siblings: each tile is inset this much on every side. */
const GAP = 1;
/** A frame's border plus padding around its contents. */
const PAD = 3;
/** Room a top block keeps for its name and size above its contents. */
export const HEADER = 40;
/** Smallest tile, in px, that gets a label: narrower ones would show only "Ca…". */
export const LABEL_MIN = { w: 64, h: 34 };
/** Contents smaller than this are not drawn at all. */
const MIN_CONTENT = 12;

export function nest(blocks: readonly Block[], bounds: Rect): Tile[] {
  const tiles: Tile[] = [];
  const place = (level: readonly Block[], area: Rect, depth: number) => {
    const rects = squarify(level.map((b) => b.litres), area);
    level.forEach((block, i) => {
      const r = rects[i]!;
      const rect = { x: r.x + GAP, y: r.y + GAP, w: r.w - 2 * GAP, h: r.h - 2 * GAP };
      if (rect.w < 2 || rect.h < 2) return;
      const fits = rect.w >= LABEL_MIN.w && rect.h >= LABEL_MIN.h;
      // Inner tag frames stay unlabelled so the items inside them can be read.
      const labelled = fits && (depth === 0 || block.kind === "item");
      tiles.push({ key: block.key, block, depth, rect, labelled });
      if (block.children.length === 0) return;
      const top = depth === 0 ? (labelled ? HEADER : 0) : 0;
      // A top block too small for its label shows no contents either.
      if (depth === 0 && !labelled) return;
      const inner = { x: rect.x + PAD, y: rect.y + top + PAD, w: rect.w - 2 * PAD, h: rect.h - top - 2 * PAD };
      if (inner.w >= MIN_CONTENT && inner.h >= MIN_CONTENT) place(block.children, inner, depth + 1);
    });
  };
  place(blocks, bounds, 0);
  return tiles;
}
