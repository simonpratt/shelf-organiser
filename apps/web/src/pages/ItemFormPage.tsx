// Add or edit one item. Spec: T1 — fast entry on a phone: name, size preset
// or litres, quantity, tags with inline path creation, note. Deleting offers
// Undo rather than a confirmation, since it is cheap to reverse. T2: when
// dictation is set up, adding offers it first, and comes back here after. T5: Claude can suggest tags.
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { useLocation, useParams } from "react-router";
import { useGoBack } from "../back";
import type { Item, Tag } from "../api/client";
import { proposeTags, useClaude } from "../api/claude";
import { useCreateItem, useCreateItemDetached, useDeleteItem, useItems, useUpdateItem } from "../api/items";
import { tagKeys, useTags } from "../api/tags";
import { ActionBar } from "../components/ActionBar";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { MicIcon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { QuantityStepper } from "../components/QuantityStepper";
import { SizePicker } from "../components/SizePicker";
import { Skeleton } from "../components/Skeleton";
import { TagInput } from "../components/TagInput";
import { TagProposals } from "../components/TagProposals";
import { TextField } from "../components/TextField";
import { useToast } from "../components/Toast";
import { addTag, carriedTags, emptyForm, fromItem, locationDimension, toInput, typeDimension, type FormErrors, type ItemForm } from "../items/form";
import type { DictateState } from "./DictatePage";

export function ItemFormPage() {
  const { id } = useParams();
  const items = useItems();
  if (id === undefined) return <Editor />;
  const item = items.data?.find((it) => String(it.id) === id);
  return (
    <AppShell nav={false}>
      {items.isPending ? (
        <><PageHeader title="Edit item" back={{ to: "/", label: "Back to items" }} /><Skeleton rows={4} label="Loading item" /></>
      ) : items.isError ? (
        <><PageHeader title="Edit item" back={{ to: "/", label: "Back to items" }} />
          <Banner action={<Button onClick={() => items.refetch()}>Retry</Button>}>Couldn't load the item: {items.error.message}</Banner></>
      ) : !item ? (
        <><PageHeader title="Edit item" back={{ to: "/", label: "Back to items" }} />
          <EmptyState title="Item not found" action={<Button to="/">Back to items</Button>}>It may have been deleted.</EmptyState></>
      ) : (
        <Editor key={item.id} item={item} />
      )}
    </AppShell>
  );
}

function Editor({ item }: { item?: Item }) {
  const goBack = useGoBack();
  const toast = useToast();
  const tags = useTags();
  const claude = useClaude();
  const create = useCreateItem();
  const update = useUpdateItem(item?.id ?? 0);
  const remove = useDeleteItem();
  const createDetached = useCreateItemDetached();
  // After a dictation is saved, the Add form opens with its location carried.
  const carried = (useLocation().state as DictateState | null)?.tags;
  const [form, setForm] = useState<ItemForm>(() => (item ? fromItem(item) : emptyForm(carried)));
  const [errors, setErrors] = useState<FormErrors>({});
  const nameRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"save" | "another">("save");
  const qc = useQueryClient();
  const dimension = typeDimension(tags.data);
  const location = locationDimension(tags.data);
  const set = <K extends keyof ItemForm>(key: K) => (value: ItemForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    // A fixed field drops its error straight away rather than on the next save.
    setErrors((e) => (key in e ? { ...e, [key]: undefined } : e));
  };
  const save = item ? update : create;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const another = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "another";
    setMode(another ? "another" : "save");
    const { input, errors } = toInput(form);
    setErrors(errors);
    if (!input) return;
    try {
      const saved = await save.mutateAsync(input);
      if (another) {
        // The save has refreshed the tags, which may have just started a Location dimension.
        setForm(emptyForm(carriedTags(input.tags, locationDimension(qc.getQueryData<Tag[]>(tagKeys.all)))));
        toast({ message: `Saved “${saved.name}”. Add the next one.` });
        nameRef.current?.focus();
      } else {
        toast({ message: `Saved “${saved.name}”` });
        goBack("/");
      }
    } catch {
      // save.error is shown in the banner below
    }
  };

  const onDelete = async () => {
    if (!item) return;
    try {
      await remove.mutateAsync(item.id);
    } catch {
      return;
    }
    const restore = { name: item.name, litres: item.litres, quantity: item.quantity, note: item.note, tags: item.tags.map((t) => t.path) };
    toast({
      message: `Deleted “${item.name}”`,
      // This editor has unmounted by the time Undo is tapped, so the restore
      // must not depend on its mutation observer.
      action: {
        label: "Undo",
        onClick: () => {
          createDetached(restore).then(
            () => toast({ message: `Restored “${item.name}”` }),
            (err: Error) => toast({ message: `Couldn't restore “${item.name}”: ${err.message}` }),
          );
        },
      },
    });
    goBack("/");
  };

  const busy = save.isPending || remove.isPending;

  const body = (
    <form onSubmit={onSubmit} noValidate className="flex flex-1 flex-col gap-5">
      <PageHeader title={item ? "Edit item" : "Add item"} back={{ to: "/", label: "Cancel and go back" }}
        actions={item && <Button variant="danger" busy={remove.isPending} disabled={busy} onClick={onDelete}>Delete</Button>} />
      {/* Hidden, not disabled, without an API key: typed entry is the whole app then. */}
      {!item && claude.data?.enabled && (
        <Button to="/items/dictate" state={{ tags: carriedTags(form.tags, location) } satisfies DictateState}
          block size="lg" icon={<MicIcon />}>Dictate items</Button>
      )}
      <TextField ref={nameRef} label="Name" value={form.name} onChange={set("name")} error={errors.name}
        autoFocus={!item} autoCapitalize="sentences" enterKeyHint="next" placeholder="e.g. Camping chairs" />
      <SizePicker litres={form.litres} onChange={set("litres")} error={errors.litres} />
      <QuantityStepper value={form.quantity} onChange={set("quantity")} error={errors.quantity} />
      <TagInput value={form.tags} onChange={set("tags")} draft={form.tagDraft} onDraftChange={set("tagDraft")}
        existing={(tags.data ?? []).map((t) => t.path)} location={location} />
      {claude.data?.enabled && (
        <TagProposals key={form.name.trim()} ready={form.name.trim() !== ""} chosen={form.tags} typeDimension={dimension}
          propose={() => proposeTags({ name: form.name, note: form.note, tags: form.tags })}
          onAdd={(p) => set("tags")(addTag(form.tags, p))} />
      )}
      <TextField label="Note (optional)" multiline value={form.note} onChange={set("note")} />
      <div className="flex-1" />
      <ActionBar notice={<>
        {save.error && <Banner>Couldn't save: {save.error.message}</Banner>}
        {remove.error && <Banner>Couldn't delete: {remove.error.message}</Banner>}
      </>}>
        <Button type="submit" variant="primary" block busy={save.isPending && mode === "save"} disabled={busy}
          value="save">Save</Button>
        {!item && (
          <Button type="submit" block busy={save.isPending && mode === "another"} disabled={busy}
            value="another">Save and add another</Button>
        )}
      </ActionBar>
    </form>
  );
  return item ? body : <AppShell nav={false}>{body}</AppShell>;
}
