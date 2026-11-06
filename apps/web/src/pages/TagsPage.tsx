// The tag tree: add tags by path, and rename, move or delete them. Deleting a
// tag deletes everything below it; items stay, they just lose those tags.
// Renaming or moving a tag onto one that already exists offers to merge them.
import { useState, type FormEvent } from "react";
import type { Tag } from "../api/client";
import { useDeleteTag, useEnsureTag, useTags, useUpdateTag } from "../api/tags";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { PlusIcon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { Select } from "../components/Select";
import { Skeleton } from "../components/Skeleton";
import { TagTreeRow } from "../components/TagTreeRow";
import { TextField } from "../components/TextField";
import { useToast } from "../components/Toast";
import { clashingSibling, mergeSummary, tagsInside } from "../tags/edit";
import { formatPath, parseTagPath, subtreeIds } from "../tags/path";

export function TagsPage() {
  const tags = useTags();
  const ensure = useEnsureTag();
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Tag | null>(null);

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    const path = parseTagPath(draft);
    if (path.length === 0) return;
    try {
      const tag = await ensure.mutateAsync(path);
      setDraft("");
      toast({ message: `Added “${formatPath(tag.path)}”` });
    } catch {
      // shown in the banner below
    }
  };

  return (
    <AppShell>
      <PageHeader title="Tags" summary="Top-level tags are dimensions, like Location or Type. Nest the rest inside them." />
      <form onSubmit={onAdd}>
        <TextField label="New tag" value={draft} onChange={setDraft} placeholder="e.g. Location/Shed/Shelf 2"
          autoCapitalize="words" hint="Use / to nest. Missing parents are created."
          action={<Button type="submit" variant="primary" icon={<PlusIcon />} busy={ensure.isPending} disabled={!draft.trim()}>Add</Button>} />
      </form>
      {ensure.error && <Banner>Couldn't add the tag: {ensure.error.message}</Banner>}
      {tags.isPending ? (
        <Skeleton label="Loading tags" />
      ) : tags.isError ? (
        <Banner action={<Button onClick={() => tags.refetch()}>Retry</Button>}>Couldn't load tags: {tags.error.message}</Banner>
      ) : tags.data.length === 0 ? (
        <EmptyState title="No tags yet">Add one above, or while adding an item.</EmptyState>
      ) : (
        <ul aria-label="Tags" className="rounded-md border-t border-border">
          {tags.data.map((t) => (
            <li key={t.id}>
              <TagTreeRow name={t.name} depth={t.path.length - 1} itemCount={t.itemCount} totalSpace={t.totalSpace} onSelect={() => setEditing(t)} />
            </li>
          ))}
        </ul>
      )}
      {editing && <TagEditor key={editing.id} tag={editing} all={tags.data ?? []} onClose={() => setEditing(null)} />}
    </AppShell>
  );
}

function TagEditor({ tag, all, onClose }: { tag: Tag; all: Tag[]; onClose: () => void }) {
  const update = useUpdateTag();
  const remove = useDeleteTag();
  const toast = useToast();
  const [name, setName] = useState(tag.name);
  const [parent, setParent] = useState(tag.parentId === null ? "" : String(tag.parentId));
  const [confirming, setConfirming] = useState<"delete" | "merge" | null>(null);
  const below = subtreeIds(all, tag.id);
  // A tag can't move inside itself or its own descendants.
  const parents = all.filter((t) => !below.has(t.id));
  const descendants = tagsInside(all, tag.id);
  const parentId = parent === "" ? null : Number(parent);
  const mergeTarget = clashingSibling(all, tag, name, parentId);

  const save = async (merge: boolean) => {
    try {
      const saved = await update.mutateAsync({ id: tag.id, name, parentId, merge });
      toast({ message: merge ? `Merged into “${formatPath(saved.path)}”` : `Saved “${formatPath(saved.path)}”` });
      onClose();
    } catch {
      // shown in the banner or the merge dialog
    }
  };
  const onSave = (e: FormEvent) => {
    e.preventDefault();
    if (mergeTarget) {
      update.reset();
      setConfirming("merge");
    } else {
      void save(false);
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(tag.id);
      toast({ message: `Deleted “${formatPath(tag.path)}”` });
      onClose();
    } catch {
      // shown in the confirm dialog
    }
  };

  return (
    <>
      <Dialog open={confirming === null} onClose={onClose} title={`Edit “${formatPath(tag.path)}”`}>
        <form onSubmit={onSave} className="flex flex-col gap-4">
          <TextField label="Name" value={name} onChange={setName} />
          <Select label="Inside" value={parent} onChange={setParent}
            options={[{ value: "", label: "Nothing (top level)" }, ...parents.map((t) => ({ value: String(t.id), label: formatPath(t.path) }))]} />
          {update.error && <Banner>Couldn't save: {update.error.message}</Banner>}
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="danger" onClick={() => setConfirming("delete")}>Delete</Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="primary" busy={update.isPending}>{mergeTarget ? "Merge…" : "Save"}</Button>
            </div>
          </div>
        </form>
      </Dialog>
      {mergeTarget && (
        <ConfirmDialog open={confirming === "merge"} title={`Merge “${tag.name}” into “${mergeTarget.name}”?`} confirmLabel="Merge tags"
          busy={update.isPending} error={update.error?.message} onConfirm={() => save(true)} onCancel={() => setConfirming(null)}>
          {mergeSummary(tag, mergeTarget, descendants)}
        </ConfirmDialog>
      )}
      <ConfirmDialog open={confirming === "delete"} title={`Delete “${tag.name}”?`} confirmLabel="Delete tag" busy={remove.isPending}
        error={remove.error?.message} onConfirm={onDelete} onCancel={() => setConfirming(null)}>
        {descendants > 0
          ? `This also deletes the ${descendants === 1 ? "tag" : `${descendants} tags`} inside it. `
          : ""}
        {tag.itemCount === 0
          ? "No items have " + (descendants > 0 ? "these tags" : "this tag") + "."
          : `${tag.itemCount === 1 ? "1 item loses" : `${tag.itemCount} items lose`} ${descendants > 0 ? "these tags" : "this tag"} but stays.`}
        {" "}This can't be undone.
      </ConfirmDialog>
    </>
  );
}
