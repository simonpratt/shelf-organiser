// What takes up the space (T3): items grouped into nested blocks following the
// tag tree, for the treemap and its list view. Domain decisions:
// - Within the chosen dimension (or the whole tag tree for "All tags"), an
//   item counts once, under its most specific tag: the deepest one, ties
//   going to the first by tag path. So the blocks always add up to the
//   items' total space.
// - Items with no tag in the dimension go in one "Untagged" block.
import { formatPath, subtreeIds, type TagPath } from "../tags/path";
import { totalLitres } from "../items/size";

type SpaceItem = { id: number; name: string; litres: number; quantity: number; tags: { id: number; path: TagPath }[] };
type SpaceTag = { id: number; parentId: number | null; name: string; path: TagPath };

export type BlockKind = "root" | "tag" | "item" | "untagged";

export type Block = {
  /** Unique in one breakdown, and what the URL names: "tag:3", "item:7", "untagged", "root". */
  key: string;
  kind: BlockKind;
  name: string;
  /** The tag's or item's id; null for the root and Untagged. */
  id: number | null;
  /** Total space, in litres. */
  litres: number;
  /** Items inside, each counted once. */
  itemCount: number;
  /** Largest first; empty for an item. */
  children: Block[];
};

export const UNTAGGED = "untagged";

/** dimensionId null groups by every tag ("All tags"). */
export function breakdown(items: readonly SpaceItem[], tags: readonly SpaceTag[], dimensionId: number | null): Block {
  const dimension = dimensionId === null ? undefined : tags.find((t) => t.id === dimensionId && t.parentId === null);
  const within = dimension ? subtreeIds(tags, dimension.id) : new Set(tags.map((t) => t.id));

  // Where each item goes: the id of its most specific tag in the dimension, or null.
  const placed = new Map<number | null, SpaceItem[]>();
  for (const item of items) {
    const home = mostSpecific(item.tags.filter((t) => within.has(t.id)));
    const key = home ? home.id : null;
    placed.set(key, [...(placed.get(key) ?? []), item]);
  }

  const childTags = new Map<number | null, SpaceTag[]>();
  for (const t of tags) {
    if (within.has(t.id)) childTags.set(t.parentId, [...(childTags.get(t.parentId) ?? []), t]);
  }

  const itemBlock = (it: SpaceItem): Block => ({
    key: `item:${it.id}`, kind: "item", name: it.name, id: it.id, litres: totalLitres(it), itemCount: 1, children: [],
  });
  const group = (key: string, kind: BlockKind, name: string, id: number | null, children: Block[]): Block => ({
    key, kind, name, id, children: sortBySpace(children),
    litres: children.reduce((s, c) => s + c.litres, 0),
    itemCount: children.reduce((s, c) => s + c.itemCount, 0),
  });
  const contents = (tagId: number | null): Block[] => [
    ...(childTags.get(tagId) ?? []).map(tagBlock).filter((b) => b.itemCount > 0),
    ...(tagId === null ? [] : (placed.get(tagId) ?? []).map(itemBlock)),
  ];
  const tagBlock = (t: SpaceTag): Block => group(`tag:${t.id}`, "tag", t.name, t.id, contents(t.id));

  const untagged = (placed.get(null) ?? []).map(itemBlock);
  const top = dimension ? contents(dimension.id) : contents(null);
  if (untagged.length > 0) top.push(group(UNTAGGED, "untagged", "Untagged", null, untagged));
  return group("root", "root", dimension ? dimension.name : "All tags", dimension?.id ?? null, top);
}

function mostSpecific<T extends { path: TagPath }>(tags: readonly T[]): T | undefined {
  return [...tags].sort((a, b) => b.path.length - a.path.length || formatPath(a.path).localeCompare(formatPath(b.path)))[0];
}

function sortBySpace(blocks: Block[]): Block[] {
  return blocks.sort((a, b) => b.litres - a.litres || a.name.localeCompare(b.name));
}

/**
 * The blocks from the root down to the one with key, for the breadcrumb.
 * Falls back to just the root when key isn't there (a deleted tag, an old
 * link) or names an item, which has nothing inside to show.
 */
export function trail(root: Block, key: string | null): Block[] {
  const walk = (b: Block): Block[] | null => {
    if (b.key === key) return [b];
    for (const c of b.children) {
      const found = walk(c);
      if (found) return [b, ...found];
    }
    return null;
  };
  const found = key ? walk(root) : null;
  return found && found.at(-1)?.kind !== "item" ? found : [root];
}

const percent = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 0 });

/** part as a share of whole: "34%", "<1%" for a sliver, never "0%" for something there. */
export function formatShare(part: number, whole: number): string {
  if (whole <= 0) return "–";
  const share = part / whole;
  return share > 0 && share < 0.005 ? "<1%" : percent.format(share);
}
