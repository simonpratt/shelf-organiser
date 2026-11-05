// Proposed tags from Claude (T5, ADR 0002): which still need showing on the
// item form, and turning an Organise answer into a review and back into the
// tags to add.
import { samePath, type TagPath } from "./path";

type Proposed = { path: TagPath; isNew: boolean };

/** True when no existing tag has this path, so applying it creates one. */
export function isNewPath(path: TagPath, existing: TagPath[]): boolean {
  return !existing.some((e) => samePath(e, path));
}

/** The proposals not already among the item's tags, so a tapped chip goes away. */
export function unchosen<T extends Proposed>(proposed: T[], chosen: TagPath[]): T[] {
  return proposed.filter((p) => !chosen.some((c) => samePath(c, p.path)));
}

/** One item on the Organise review: the tags that Apply will add to it. */
export type Reviewed = { itemId: number; name: string; tags: TagPath[] };

/** The review rows for an Organise answer, dropping items that have since gone. */
export function toReview(proposals: { itemId: number; tags: Proposed[] }[], items: { id: number; name: string }[]): Reviewed[] {
  const names = new Map(items.map((it) => [it.id, it.name]));
  return proposals.flatMap((p) => {
    const name = names.get(p.itemId);
    return name === undefined ? [] : [{ itemId: p.itemId, name, tags: p.tags.map((t) => t.path) }];
  });
}

/** What Apply sends: every reviewed item left with at least one tag. */
export function toAssignments(rows: Reviewed[]): { itemId: number; tags: TagPath[] }[] {
  return rows.filter((r) => r.tags.length > 0).map((r) => ({ itemId: r.itemId, tags: r.tags }));
}
