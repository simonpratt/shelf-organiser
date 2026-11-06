import { describe, expect, it } from "vitest";
import { clashingSibling, deleteSummary, mergeSummary, tagsInside } from "./edit";

const tag = (id: number, path: string[], parentId: number | null, itemCount = 0) =>
  ({ id, name: path[path.length - 1]!, parentId, path, itemCount });

const tree = [
  tag(1, ["Location"], null, 6),
  tag(2, ["Location", "Shed"], 1, 6),
  tag(3, ["Location", "Shed", "Workbench"], 2, 5),
  tag(4, ["Location", "Shed", "Workbench", "Drawer"], 3, 1),
  tag(5, ["Location", "Shed", "Left shelf"], 2, 1),
];

describe("clashingSibling", () => {
  it("finds a sibling with the new name, ignoring case and spaces", () => {
    expect(clashingSibling(tree, tree[2]!, " left SHELF ", 2)?.id).toBe(5);
  });
  it("finds a same-named tag under the parent it moves to", () => {
    expect(clashingSibling(tree, tag(9, ["Shed"], null), "Shed", 1)?.id).toBe(2);
  });
  it("ignores the tag itself and same names elsewhere", () => {
    expect(clashingSibling(tree, tree[2]!, "workbench", 2)).toBeUndefined();
    expect(clashingSibling(tree, tree[2]!, "Left shelf", 1)).toBeUndefined();
  });
});

describe("mergeSummary", () => {
  it("says where the items and tags inside go", () => {
    expect(mergeSummary(tree[2]!, tree[4]!, tagsInside(tree, 3))).toBe(
      "“Location › Shed › Left shelf” already exists. Its 5 items and the tag inside it move to " +
        "“Location › Shed › Left shelf”, merging tags with the same name, and “Workbench” is deleted. This can't be undone.");
  });
  it("agrees the verb with a single thing moving", () => {
    expect(mergeSummary(tree[4]!, tree[2]!, 0)).toContain("Its 1 item moves to");
    expect(mergeSummary(tree[3]!, tree[2]!, 1)).toContain("Its 1 item and the tag inside it move to");
  });
  it("says an empty tag is just deleted", () => {
    expect(mergeSummary(tag(9, ["Shed"], null), tree[1]!, 0)).toBe(
      "“Location › Shed” already exists. “Shed” has no items or tags inside it, so it is just deleted. This can't be undone.");
  });
});

describe("deleteSummary", () => {
  it("moves a nested tag's items up to its parent", () => {
    expect(deleteSummary(tree[2]!, 1, tree[1]!)).toBe(
      "This also deletes the tag inside it. 5 items move up to “Shed”. This can't be undone.");
    expect(deleteSummary(tree[4]!, 0, tree[1]!)).toBe("1 item moves up to “Shed”. This can't be undone.");
  });
  it("has a top-level tag's items lose it, with matching grammar", () => {
    expect(deleteSummary(tag(1, ["Type"], null, 1), 0, undefined)).toBe("1 item loses this tag but stays. This can't be undone.");
    expect(deleteSummary(tree[0]!, 4, undefined)).toBe(
      "This also deletes the 4 tags inside it. 6 items lose these tags but stay. This can't be undone.");
  });
  it("says when no items have it", () => {
    expect(deleteSummary(tag(1, ["Type"], null), 0, undefined)).toBe("No items have this tag. This can't be undone.");
  });
});
