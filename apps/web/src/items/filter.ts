// Filtering and summarising the item list. Search matches the name, note or
// any tag path; a tag filter includes items tagged anywhere below that tag.
import { formatPath, subtreeIds } from "../tags/path";
import { totalLitres } from "./size";

type FilterableItem = {
  name: string;
  note: string;
  litres: number;
  quantity: number;
  tags: { id: number; path: string[] }[];
};
type TagNode = { id: number; parentId: number | null; path: string[] };

export type ItemFilter = { query: string; tagId: number | null };

export function filterItems<T extends FilterableItem>(
  items: readonly T[],
  tags: readonly TagNode[],
  { query, tagId }: ItemFilter,
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const within = tagId === null ? null : subtreeIds(tags, tagId);
  return items.filter((item) => {
    if (within && !item.tags.some((t) => within.has(t.id))) return false;
    const haystack = [item.name, item.note, ...item.tags.map((t) => formatPath(t.path))].join("\n").toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export function summarise(items: readonly { litres: number; quantity: number }[]) {
  return { count: items.length, totalLitres: items.reduce((sum, it) => sum + totalLitres(it), 0) };
}
