// Tag paths: how a nested tag is typed ("Type/Camping"), shown
// ("Type › Camping") and suggested while tagging an item.

export type TagPath = string[];
type TagNode = { id: number; parentId: number | null; path: TagPath };

export const SEPARATOR = " › ";

export function formatPath(path: TagPath): string {
  return path.join(SEPARATOR);
}

/** Splits typed text on "/" or "›" into trimmed, non-empty names. */
export function parseTagPath(text: string): TagPath {
  return text
    .split(/[/›]/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Tag names compare ignoring case, as the server matches them. */
export function samePath(a: TagPath, b: TagPath): boolean {
  return a.length === b.length && a.every((name, i) => name.toLowerCase() === b[i]?.toLowerCase());
}

/** id and the ids of every tag below it. */
export function subtreeIds(tags: readonly TagNode[], id: number): Set<number> {
  const ids = new Set([id]);
  // Tags arrive sorted by path, so parents precede children, but don't rely on it.
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tags) {
      if (t.parentId !== null && ids.has(t.parentId) && !ids.has(t.id)) {
        ids.add(t.id);
        grew = true;
      }
    }
  }
  return ids;
}

export type Suggestion = { path: TagPath; isNew: boolean };

/**
 * Options for the tag field as the user types: existing tags whose path
 * contains the text, then, unless the text names an existing tag, an option
 * to create it. Tags already chosen are left out.
 */
export function suggestTags(
  existing: readonly TagPath[],
  text: string,
  chosen: readonly TagPath[],
  limit = 6,
): Suggestion[] {
  const typed = parseTagPath(text);
  if (typed.length === 0) return [];
  const needle = typed.join("/").toLowerCase();
  const isChosen = (p: TagPath) => chosen.some((c) => samePath(c, p));
  const matches = existing
    .filter((p) => !isChosen(p) && p.join("/").toLowerCase().includes(needle))
    // Shorter paths first: "Camping" before "Camping › Tents".
    .sort((a, b) => a.length - b.length)
    .slice(0, limit)
    .map((path) => ({ path, isNew: false }));
  const exists = existing.some((p) => samePath(p, typed));
  if (!exists && !isChosen(typed)) matches.push({ path: typed, isNew: true });
  return matches;
}
