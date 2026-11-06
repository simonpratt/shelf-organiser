import { describe, expect, it } from "vitest";
import { formatPath, parseTagPath, samePath, subtreeIds, suggestTags } from "./path";

describe("parseTagPath", () => {
  it("splits on slashes and the display separator, trimming names", () => {
    expect(parseTagPath(" Type / Camping›Tents ")).toEqual(["Type", "Camping", "Tents"]);
  });
  it("drops empty segments", () => {
    expect(parseTagPath("/Type//Camping/")).toEqual(["Type", "Camping"]);
    expect(parseTagPath("  ")).toEqual([]);
  });
});

it("formats paths with the display separator", () => {
  expect(formatPath(["Tools", "Power tools"])).toBe("Tools › Power tools");
});

it("compares paths ignoring case", () => {
  expect(samePath(["Type", "camping"], ["type", "Camping"])).toBe(true);
  expect(samePath(["Type"], ["Type", "Camping"])).toBe(false);
});

it("collects a tag's whole subtree", () => {
  const tags = [
    { id: 3, parentId: 2, path: ["A", "B", "C"] },
    { id: 1, parentId: null, path: ["A"] },
    { id: 2, parentId: 1, path: ["A", "B"] },
    { id: 4, parentId: null, path: ["D"] },
  ];
  expect([...subtreeIds(tags, 1)].sort()).toEqual([1, 2, 3]);
  expect([...subtreeIds(tags, 4)]).toEqual([4]);
});

describe("suggestTags", () => {
  const existing = [["Type"], ["Type", "Camping"], ["Type", "Camping", "Tents"], ["Location", "Shed"]];

  it("lists matching tags, shortest first, then offers to create the typed path", () => {
    expect(suggestTags(existing, "camp", [])).toEqual([
      { path: ["Type", "Camping"], isNew: false },
      { path: ["Type", "Camping", "Tents"], isNew: false },
      { path: ["camp"], isNew: true },
    ]);
  });

  it("doesn't offer to create a tag that exists under another case", () => {
    expect(suggestTags(existing, "type/camping", []).some((s) => s.isNew)).toBe(false);
  });

  it("leaves out tags already chosen", () => {
    expect(suggestTags(existing, "shed", [["Location", "Shed"]])).toEqual([{ path: ["shed"], isNew: true }]);
  });

  it("offers to create a loose path inside the nested tag it starts with, before the literal path", () => {
    expect(suggestTags(existing, "shed/Top shelf", [])).toEqual([
      { path: ["Location", "Shed", "Top shelf"], isNew: true },
      { path: ["shed", "Top shelf"], isNew: true },
    ]);
  });

  it("keeps a path starting with a top-level tag's name as typed", () => {
    expect(suggestTags([...existing, ["Shed"]], "Shed/Top shelf", [])).toEqual([{ path: ["Shed", "Top shelf"], isNew: true }]);
    expect(suggestTags(existing, "Camping/Chairs", [])).toEqual([
      { path: ["Type", "Camping", "Chairs"], isNew: true },
      { path: ["Camping", "Chairs"], isNew: true },
    ]);
  });

  it("suggests nothing for blank text", () => {
    expect(suggestTags(existing, " / ", [])).toEqual([]);
  });
});
