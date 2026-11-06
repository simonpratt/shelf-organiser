// Editing a tag on the Tags screen: spotting a rename or move that lands on
// a tag that already exists (which becomes a merge), and saying what a merge
// will do before the user confirms it.
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
