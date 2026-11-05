// Squarified treemap layout (Bruls, Huizing and van Wijk, 2000): splits a
// rectangle into one rectangle per value, each with an area proportional to
// its value and as close to square as the algorithm can get, so labels fit
// and blocks are easy to tap. Hand-rolled: it's 40 lines; nest.ts calls it
// once per level of the space map.

export type Rect = { x: number; y: number; w: number; h: number };

/** values should be sorted largest first; the result is in the same order. Non-positive values get empty rectangles. */
export function squarify(values: readonly number[], bounds: Rect): Rect[] {
  const total = values.reduce((s, v) => s + Math.max(v, 0), 0);
  const out: Rect[] = values.map(() => ({ x: bounds.x, y: bounds.y, w: 0, h: 0 }));
  if (total <= 0 || bounds.w <= 0 || bounds.h <= 0) return out;

  const scale = (bounds.w * bounds.h) / total;
  const order = values.map((v, i) => ({ i, area: Math.max(v, 0) * scale })).filter((a) => a.area > 0);
  let { x, y, w, h } = bounds;
  let start = 0;
  while (start < order.length) {
    // Grow the row along the shorter side while that makes its worst aspect ratio no worse.
    const side = Math.min(w, h);
    let end = start + 1;
    while (end < order.length && worst(order.slice(start, end + 1), side) <= worst(order.slice(start, end), side)) end++;
    const row = order.slice(start, end);
    const thickness = row.reduce((s, a) => s + a.area, 0) / side;
    let offset = 0;
    for (const a of row) {
      const length = a.area / thickness;
      out[a.i] = w >= h ? { x, y: y + offset, w: thickness, h: length } : { x: x + offset, y, w: length, h: thickness };
      offset += length;
    }
    if (w >= h) { x += thickness; w -= thickness; } else { y += thickness; h -= thickness; }
    start = end;
  }
  return out;
}

/** The worst aspect ratio (≥ 1) of a row of areas laid along a side. */
function worst(row: readonly { area: number }[], side: number): number {
  const sum = row.reduce((s, a) => s + a.area, 0);
  return Math.max(...row.map((a) => Math.max((side * side * a.area) / (sum * sum), (sum * sum) / (side * side * a.area))));
}
