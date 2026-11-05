import { describe, expect, it } from "vitest";
import { breakdown } from "./breakdown";
import { HEADER, nest } from "./nest";

// Location › Shed › Floor holds a 500 L mower and a 20 L crate; Location › Loft a 100 L box.
const tags = [
  { id: 1, parentId: null, name: "Location", path: ["Location"] },
  { id: 2, parentId: 1, name: "Shed", path: ["Location", "Shed"] },
  { id: 3, parentId: 2, name: "Floor", path: ["Location", "Shed", "Floor"] },
  { id: 4, parentId: 1, name: "Loft", path: ["Location", "Loft"] },
];
const ref = (id: number) => ({ id, path: tags.find((t) => t.id === id)!.path });
const items = [
  { id: 10, name: "Mower", litres: 500, quantity: 1, tags: [ref(3)] },
  { id: 11, name: "Crate", litres: 20, quantity: 1, tags: [ref(3)] },
  { id: 12, name: "Box", litres: 100, quantity: 1, tags: [ref(4)] },
];
const root = breakdown(items, tags, 1);
const byKey = (tiles: ReturnType<typeof nest>) => new Map(tiles.map((t) => [t.key, t]));

describe("nest", () => {
  it("lays each top block's contents out inside it, down to the items", () => {
    const tiles = byKey(nest(root.children, { x: 0, y: 0, w: 480, h: 360 }));
    expect([...tiles.keys()]).toEqual(["tag:2", "tag:3", "item:10", "item:11", "tag:4", "item:12"]);
    expect(tiles.get("tag:2")).toMatchObject({ depth: 0, labelled: true });
    expect(tiles.get("item:10")).toMatchObject({ depth: 2, labelled: true });
    // Inner tag frames are left unlabelled so their items can be read.
    expect(tiles.get("tag:3")).toMatchObject({ depth: 1, labelled: false });

    const shed = tiles.get("tag:2")!.rect, mower = tiles.get("item:10")!.rect;
    expect(mower.y).toBeGreaterThanOrEqual(shed.y + HEADER);
    expect(mower.x + mower.w).toBeLessThanOrEqual(shed.x + shed.w);
    expect(mower.y + mower.h).toBeLessThanOrEqual(shed.y + shed.h);
    // The mower takes most of the Shed's contents.
    expect(mower.w * mower.h).toBeGreaterThan(0.75 * tiles.get("tag:3")!.rect.w * tiles.get("tag:3")!.rect.h);
  });

  it("shows nothing inside a top block too small for its label", () => {
    const tiles = nest(root.children, { x: 0, y: 0, w: 60, h: 40 });
    expect(tiles.every((t) => t.depth === 0)).toBe(true);
  });

  it("is empty with nothing to lay out or no room", () => {
    expect(nest([], { x: 0, y: 0, w: 360, h: 360 })).toEqual([]);
    expect(nest(root.children, { x: 0, y: 0, w: 0, h: 0 })).toEqual([]);
  });
});
