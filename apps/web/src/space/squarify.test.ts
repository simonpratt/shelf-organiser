import { describe, expect, it } from "vitest";
import { squarify, type Rect } from "./squarify";

const area = (r: Rect) => r.w * r.h;
const bounds = { x: 0, y: 0, w: 6, h: 4 };

describe("squarify", () => {
  it("lays out the paper's example: areas match the values and tile the rectangle", () => {
    const values = [6, 6, 4, 3, 2, 2, 1];
    const rects = squarify(values, bounds);
    rects.forEach((r, i) => expect(area(r)).toBeCloseTo(values[i]!));
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(6 + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(4 + 1e-9);
    }
    // The first row is the two 6s stacked in a 3-wide column, as in the paper.
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 3, h: 2 });
    expect(rects[1]).toEqual({ x: 0, y: 2, w: 3, h: 2 });
  });

  it("scales values to the rectangle's area", () => {
    const rects = squarify([300, 100], { x: 10, y: 20, w: 100, h: 100 });
    expect(area(rects[0]!)).toBeCloseTo(7500);
    expect(area(rects[1]!)).toBeCloseTo(2500);
    expect(rects[0]!.x).toBe(10);
  });

  it("gives zero and negative values, an empty total or empty bounds empty rectangles", () => {
    expect(squarify([5, 0], bounds)[1]).toMatchObject({ w: 0, h: 0 });
    expect(squarify([0, 0], bounds).every((r) => area(r) === 0)).toBe(true);
    expect(squarify([1], { x: 0, y: 0, w: 0, h: 4 })[0]).toMatchObject({ w: 0, h: 0 });
    expect(squarify([], bounds)).toEqual([]);
  });
});
