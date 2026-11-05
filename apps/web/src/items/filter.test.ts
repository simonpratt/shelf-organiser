import { describe, expect, it } from "vitest";
import { filterItems, summarise } from "./filter";

// Two top-level tags; Camping (2) sits under Type (1), Shed (4) under Location (3).
const tags = [
  { id: 1, parentId: null, path: ["Type"] },
  { id: 2, parentId: 1, path: ["Type", "Camping"] },
  { id: 3, parentId: null, path: ["Location"] },
  { id: 4, parentId: 3, path: ["Location", "Shed"] },
];
const items = [
  { name: "Tent", note: "", litres: 30, quantity: 2, tags: [{ id: 2, path: ["Type", "Camping"] }] },
  { name: "Drill", note: "cordless", litres: 5, quantity: 1, tags: [{ id: 4, path: ["Location", "Shed"] }] },
  { name: "Lamp", note: "", litres: 8, quantity: 1, tags: [] },
];
const names = (xs: { name: string }[]) => xs.map((x) => x.name);

describe("filterItems", () => {
  it("returns everything with no filter", () => {
    expect(names(filterItems(items, tags, { query: "", tagId: null }))).toEqual(["Tent", "Drill", "Lamp"]);
  });
  it("includes items tagged below the chosen tag", () => {
    expect(names(filterItems(items, tags, { query: "", tagId: 1 }))).toEqual(["Tent"]);
  });
  it("matches every search word against name, note and tag paths, ignoring case", () => {
    expect(names(filterItems(items, tags, { query: "CORDLESS", tagId: null }))).toEqual(["Drill"]);
    expect(names(filterItems(items, tags, { query: "shed drill", tagId: null }))).toEqual(["Drill"]);
    expect(names(filterItems(items, tags, { query: "camping lamp", tagId: null }))).toEqual([]);
  });
  it("combines the tag filter with search", () => {
    expect(names(filterItems(items, tags, { query: "drill", tagId: 1 }))).toEqual([]);
  });
});

it("summarises count and total space", () => {
  expect(summarise(items)).toEqual({ count: 3, totalLitres: 73 });
  expect(summarise([])).toEqual({ count: 0, totalLitres: 0 });
});
