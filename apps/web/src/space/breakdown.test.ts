import { describe, expect, it } from "vitest";
import { breakdown, formatShare, trail, type Block } from "./breakdown";

// Location › Shed › Shelf 2, Location › Loft, Type › Camping.
const tags = [
  { id: 1, parentId: null, name: "Location", path: ["Location"] },
  { id: 2, parentId: 1, name: "Shed", path: ["Location", "Shed"] },
  { id: 3, parentId: 2, name: "Shelf 2", path: ["Location", "Shed", "Shelf 2"] },
  { id: 4, parentId: 1, name: "Loft", path: ["Location", "Loft"] },
  { id: 5, parentId: null, name: "Type", path: ["Type"] },
  { id: 6, parentId: 5, name: "Camping", path: ["Type", "Camping"] },
];
const ref = (id: number) => ({ id, path: tags.find((t) => t.id === id)!.path });
// 300 L in all: tent 100 (Shelf 2 and its ancestor Shed, Camping), chairs
// 2 × 40 (Shed, Camping), lamp 20 (Loft), bike 100 (no tags).
const items = [
  { id: 10, name: "Tent", litres: 100, quantity: 1, tags: [ref(2), ref(3), ref(6)] },
  { id: 11, name: "Camping chairs", litres: 40, quantity: 2, tags: [ref(2), ref(6)] },
  { id: 12, name: "Lamp", litres: 20, quantity: 1, tags: [ref(4)] },
  { id: 13, name: "Bike", litres: 100, quantity: 1, tags: [] },
];

/** "name litres [children]" for compact assertions. */
const shape = (b: Block): string =>
  b.children.length ? `${b.name} ${b.litres} [${b.children.map(shape).join(", ")}]` : `${b.name} ${b.litres}`;

describe("breakdown", () => {
  it("nests a dimension's tags, with each item under its most specific tag and the rest untagged", () => {
    const root = breakdown(items, tags, 1);
    expect(shape(root)).toBe("Location 300 [Shed 180 [Shelf 2 100 [Tent 100], Camping chairs 80], Untagged 100 [Bike 100], Loft 20 [Lamp 20]]");
    expect(root.itemCount).toBe(4);
  });

  it("puts items with no tag in the dimension in Untagged", () => {
    expect(shape(breakdown(items, tags, 5))).toBe("Type 300 [Camping 180 [Tent 100, Camping chairs 80], Untagged 120 [Bike 100, Lamp 20]]");
  });

  it("lists every item ungrouped, largest first, under All items", () => {
    expect(shape(breakdown(items, tags, null))).toBe("All items 300 [Bike 100, Tent 100, Camping chairs 80, Lamp 20]");
  });

  it("breaks a tie on depth by tag path", () => {
    // Shed and Loft are both depth 2; Location › Loft sorts first. Camping is outside Location.
    const both = [{ id: 1, name: "Stool", litres: 10, quantity: 1, tags: [ref(6), ref(2), ref(4)] }];
    expect(shape(breakdown(both, tags, 1))).toBe("Location 10 [Loft 10 [Stool 10]]");
  });

  it("keeps an item tagged with the dimension itself directly inside it, and drops empty tags", () => {
    const root = breakdown([{ id: 1, name: "Rake", litres: 30, quantity: 1, tags: [ref(1)] }], tags, 1);
    expect(shape(root)).toBe("Location 30 [Rake 30]");
  });

  it("is an empty root with no items", () => {
    expect(breakdown([], tags, null)).toMatchObject({ litres: 0, itemCount: 0, children: [] });
  });
});

describe("trail", () => {
  const root = breakdown(items, tags, 1);
  it("lists the blocks from the root down", () => {
    expect(trail(root, "tag:3").map((b) => b.name)).toEqual(["Location", "Shed", "Shelf 2"]);
    expect(trail(root, "untagged").map((b) => b.name)).toEqual(["Location", "Untagged"]);
  });
  it("falls back to the root for a missing tag or an item", () => {
    expect(trail(root, "tag:99").map((b) => b.name)).toEqual(["Location"]);
    expect(trail(root, "item:10").map((b) => b.name)).toEqual(["Location"]);
    expect(trail(root, null).map((b) => b.name)).toEqual(["Location"]);
  });
});

describe("formatShare", () => {
  it("rounds to a whole percent, shows slivers as <1% and guards an empty whole", () => {
    expect(formatShare(1, 3)).toBe("33%");
    expect(formatShare(1, 1000)).toBe("<1%");
    expect(formatShare(0, 10)).toBe("0%");
    expect(formatShare(5, 0)).toBe("–");
  });
});
