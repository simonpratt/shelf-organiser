// Editing a tag on the Tags screen: spotting a rename or move that lands on
// a tag that already exists (which becomes a merge), and saying what a merge
// or a delete will do before the user confirms it.
import { formatPath, subtreeIds, type TagPath } from "./path";

type EditedTag = { id: number; name: string; parentId: number | null; path: TagPath; itemCount: number };

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const insideTags = (n: number) => (n === 1 ? "the tag inside it" : `the ${n} tags inside it`);

/** The tag already called name under parentId, other than tag itself, which saving would merge into. */
export function clashingSibling<T extends EditedTag>(all: readonly T[], tag: EditedTag, name: string, parentId: number | null): T | undefined {
  const lower = name.trim().toLowerCase();
  return all.find((t) => t.id !== tag.id && t.parentId === parentId && t.name.toLowerCase() === lower);
}

/** The tags inside tag, not counting itself. */
export function tagsInside(all: readonly EditedTag[], id: number): number {
  return subtreeIds(all, id).size - 1;
}

/** What merging tag into target does, for the confirm dialog. */
export function mergeSummary(tag: EditedTag, target: EditedTag, inside: number): string {
  const moved = [
    tag.itemCount > 0 && count(tag.itemCount, "item"),
    inside > 0 && insideTags(inside),
  ].filter(Boolean);
  const singular = moved.length === 1 && (tag.itemCount === 1 || (tag.itemCount === 0 && inside === 1));
  const what = moved.length > 0
    ? `Its ${moved.join(" and ")} ${singular ? "moves" : "move"} to “${formatPath(target.path)}”${inside > 0 ? ", merging tags with the same name" : ""}, and “${tag.name}” is deleted.`
    : `“${tag.name}” has no items or tags inside it, so it is just deleted.`;
  return `“${formatPath(target.path)}” already exists. ${what} This can't be undone.`;
}

/**
 * What deleting tag does, for the confirm dialog. A nested tag's items move
 * up to its parent, so they stay in the dimension; a top-level tag's items
 * just lose it.
 */
export function deleteSummary(tag: EditedTag, inside: number, parent: { name: string } | undefined): string {
  const these = inside > 0 ? "these tags" : "this tag";
  const parts = [inside > 0 ? `This also deletes ${insideTags(inside)}.` : ""];
  if (tag.itemCount === 0) parts.push(`No items have ${these}.`);
  else if (parent) parts.push(`${count(tag.itemCount, "item")} ${tag.itemCount === 1 ? "moves" : "move"} up to “${parent.name}”.`);
  else parts.push(`${count(tag.itemCount, "item")} ${tag.itemCount === 1 ? "loses" : "lose"} ${these} but ${tag.itemCount === 1 ? "stays" : "stay"}.`);
  parts.push("This can't be undone.");
  return parts.filter(Boolean).join(" ");
}
