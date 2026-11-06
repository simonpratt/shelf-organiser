// One draft on the dictation review screen (T2): a summary to check at a
// glance, opening into the item fields to correct what Claude got wrong. A
// draft with an error opens itself so the problem is in view.
import { useState } from "react";
import { describeSize } from "../items/drafts";
import type { ProposedTag } from "../api/client";
import { addTag, type FormErrors, type ItemForm } from "../items/form";
import type { TagPath } from "../tags/path";
import { Button } from "./Button";
import { CloseIcon } from "./icons";
import { QuantityStepper } from "./QuantityStepper";
import { SizePicker } from "./SizePicker";
import { TagChip } from "./TagChip";
import { TagInput } from "./TagInput";
import { TagProposals } from "./TagProposals";
import { TextField } from "./TextField";

type Props = {
  form: ItemForm;
  /** Takes an update rather than a new form: one tap can change two fields. */
  onChange: (update: (form: ItemForm) => ItemForm) => void;
  onRemove: () => void;
  errors: FormErrors;
  existingTags: TagPath[];
  /** Starts open, e.g. to show the full fields in the catalogue. */
  defaultOpen?: boolean;
  /** Asks Claude for proposed tags (T5); omitted, there is no Suggest tags. */
  propose?: (form: ItemForm) => Promise<{ dimension: string; tags: ProposedTag[] }>;
  /** The Type dimension, when the tag tree has one. */
  typeDimension?: string | null;
};

export function DraftCard({ form, onChange, onRemove, errors, existingTags, defaultOpen = false, propose, typeDimension = null }: Props) {
  const hasErrors = Object.values(errors).some(Boolean);
  const [open, setOpen] = useState(defaultOpen || hasErrors);
  // Open when a save attempt finds a problem; stay open while it's fixed.
  const [hadErrors, setHadErrors] = useState(hasErrors);
  if (hasErrors !== hadErrors) {
    setHadErrors(hasErrors);
    if (hasErrors) setOpen(true);
  }
  const set = <K extends keyof ItemForm>(key: K) => (value: ItemForm[K]) => onChange((f) => ({ ...f, [key]: value }));
  const title = form.name.trim() || "Unnamed item";

  return (
    <article aria-label={title} className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate font-medium">{title}</h2>
          <p className="text-sm text-muted">{describeSize(form)}</p>
          {!open && form.tags.length > 0 && (
            <span className="flex flex-wrap gap-1">{form.tags.map((t) => <TagChip key={t.join("/")} path={t} />)}</span>
          )}
        </div>
        <Button variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Done" : "Edit"}
        </Button>
        <Button variant="ghost" icon={<CloseIcon />} aria-label={`Remove ${title}`} onClick={onRemove} />
      </div>
      {open && (
        <>
          <TextField label="Name" value={form.name} onChange={set("name")} error={errors.name} autoCapitalize="sentences" />
          <SizePicker litres={form.litres} onChange={set("litres")} error={errors.litres} />
          <QuantityStepper value={form.quantity} onChange={set("quantity")} error={errors.quantity} />
          <TagInput value={form.tags} onChange={set("tags")} draft={form.tagDraft} onDraftChange={set("tagDraft")}
            existing={existingTags} />
          {propose && (
            <TagProposals key={form.name.trim()} ready={form.name.trim() !== ""} chosen={form.tags} typeDimension={typeDimension}
              propose={() => propose(form)} onAdd={(p) => onChange((f) => ({ ...f, tags: addTag(f.tags, p) }))} />
          )}
        </>
      )}
    </article>
  );
}
