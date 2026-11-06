import { describe, expect, it } from "vitest";
import { isNewPath, remainingNote, toAssignments, toReview, unchosen } from "./proposals";

describe("proposed tags", () => {
  it("counts a path as new only when no tag matches it ignoring case", () => {
    const existing = [["Type"], ["Type", "Garden"]];
    expect(isNewPath(["type", "garden"], existing)).toBe(false);
    expect(isNewPath(["Type", "Garden", "Lawn care"], existing)).toBe(true);
  });

  it("hides a proposal once the item has that tag", () => {
    const proposed = [{ path: ["Type", "Camping"], isNew: false }, { path: ["Type", "Furniture"], isNew: true }];
    expect(unchosen(proposed, [["type", "camping"]])).toEqual([{ path: ["Type", "Furniture"], isNew: true }]);
  });

  it("reviews only items that still exist and applies only rows left with tags", () => {
    const rows = toReview(
      [{ itemId: 1, tags: [{ path: ["Type", "Garden"], isNew: true }] }, { itemId: 9, tags: [{ path: ["Type", "Sport"], isNew: true }] }],
      [{ id: 1, name: "Lawn mower" }, { id: 2, name: "Tent" }],
    );
    expect(rows).toEqual([{ itemId: 1, name: "Lawn mower", tags: [["Type", "Garden"]] }]);
    expect(toAssignments([...rows, { itemId: 2, name: "Tent", tags: [] }])).toEqual([{ itemId: 1, tags: [["Type", "Garden"]] }]);
  });
});

describe("remainingNote", () => {
  it("suggests organising again only when the run hit its cap", () => {
    expect(remainingNote(12, true, "Type")).toBe(
      "12 more items have no Type tag yet. Organise again after applying for more proposals, or tag them by hand.");
    expect(remainingNote(1, false, "Kind")).toBe(
      "Claude couldn't place 1 more item. It stays under Untagged on the Space map; tag it by hand.");
  });
});
