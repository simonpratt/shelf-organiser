// One item on the Organise review (T5, ADR 0002): the tags Claude proposes
// adding to it, with Edit to change them and Remove to leave the item out.
// Mirrors DraftCard, so both review screens work the same way.
import { useState } from "react";
import { addTag } from "../items/form";
import { parseTagPath, type TagPath } from "../tags/path";
import { isNewPath } from "../tags/proposals";
import { Button } from "./Button";
import { CloseIcon } from "./icons";
import { TagChip } from "./TagChip";
import { TagInput } from "./TagInput";

type Props = {
  name: string;
  /** The tags Apply will add; the item keeps the tags it has. */
  tags: TagPath[];
  onChange: (tags: TagPath[]) => void;
  onRemove: () => void;
  existingTags: TagPath[];
};

export function ProposalCard({ name, tags, onChange, onRemove, existingTags }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const done = () => {
    // Text left in the tag field counts, as on the item form.
    onChange(addTag(tags, parseTagPath(draft)));
    setDraft("");
    setOpen(false);
  };

  return (
    <article aria-label={name} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-medium">{name}</h2>
        <Button variant="ghost" aria-expanded={open} onClick={open ? done : () => setOpen(true)}>
          {open ? "Done" : "Edit"}
        </Button>
        <Button variant="ghost" icon={<CloseIcon />} aria-label={`Leave out ${name}`} onClick={onRemove} />
      </div>
      {!open && (tags.length > 0 ? (
        <span className="-mt-2 flex flex-wrap gap-1">
          {tags.map((t) => <TagChip key={t.join("/")} path={t} isNew={isNewPath(t, existingTags)} />)}
        </span>
      ) : (
        <p className="-mt-2 text-sm text-muted">No tags to add; it will be left as it is.</p>
      ))}
      {open && (
        <TagInput label="Tags to add" value={tags} onChange={onChange} draft={draft} onDraftChange={setDraft} existing={existingTags} />
      )}
    </article>
  );
}
