// Dictation (T2, ADR 0001): say a list into the keyboard's microphone, let
// Claude turn it into drafts, check and correct them, then save them all.
// Nothing is saved until "Save all". The dictation and drafts are kept for the
// tab until then, so Back or a reload loses nothing. Tags for the whole
// dictation (where it all is) start from the Add form's and go on every draft.
import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { proposeTags, useClaude, useDraftItems } from "../api/claude";
import { useCreateItemDetached } from "../api/items";
import { useTags } from "../api/tags";
import { ActionBar } from "../components/ActionBar";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { DraftCard } from "../components/DraftCard";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { Skeleton } from "../components/Skeleton";
import { TagInput } from "../components/TagInput";
import { TextField } from "../components/TextField";
import { useToast } from "../components/Toast";
import { fromDraft, saveInOrder, toInputs } from "../items/drafts";
import type { FormErrors, ItemForm } from "../items/form";
import { readSession, writeSession } from "../session/store";
import { addTag, typeDimension } from "../items/form";
import { parseTagPath, type TagPath } from "../tags/path";

/** What the Add form passes on: its tags other than the Type dimension's. */
export type DictateState = { tags: TagPath[] };

const back = { to: "/items/new", label: "Back to adding an item" };

export function DictatePage() {
  const dictation = useClaude();
  return (
    <AppShell nav={false}>
      {dictation.isPending ? (
        <><PageHeader title="Dictate items" back={back} /><Skeleton rows={3} label="Loading" /></>
      ) : dictation.isError ? (
        <><PageHeader title="Dictate items" back={back} />
          <Banner action={<Button onClick={() => dictation.refetch()}>Retry</Button>}>Couldn't check dictation: {dictation.error.message}</Banner></>
      ) : !dictation.data.enabled ? (
        <><PageHeader title="Dictate items" back={back} />
          <EmptyState title="Dictation isn't set up" action={<Button to="/items/new" variant="primary">Type an item instead</Button>}>
            It needs an Anthropic API key in the server's ANTHROPIC_API_KEY setting.
          </EmptyState></>
      ) : (
        <Dictation />
      )}
    </AppShell>
  );
}

type Drafted = { key: number; form: ItemForm; errors: FormErrors };
type Kept = { transcript: string; drafts: Drafted[] | null; shared?: TagPath[]; sharedDraft?: string };
const KEPT = "dictation";

function Dictation() {
  const navigate = useNavigate();
  const toast = useToast();
  const tags = useTags();
  const draftItems = useDraftItems();
  const createItem = useCreateItemDetached();
  const passed = (useLocation().state as DictateState | null)?.tags ?? [];
  const [kept] = useState(() => readSession<Kept>(KEPT, { transcript: "", drafts: null }));
  const started = kept.transcript !== "" || kept.drafts !== null;
  const [transcript, setTranscript] = useState(kept.transcript);
  const [drafts, setDrafts] = useState<Drafted[] | null>(kept.drafts);
  const [shared, setShared] = useState<TagPath[]>(started ? (kept.shared ?? []) : passed);
  const [sharedDraft, setSharedDraft] = useState(started ? (kept.sharedDraft ?? "") : "");
  const [nothingFound, setNothingFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => writeSession(KEPT, { transcript, drafts, shared, sharedDraft }), [transcript, drafts, shared, sharedDraft]);
  const existingTags = (tags.data ?? []).map((t) => t.path);
  const sharedField = (
    <TagInput label="Tags for every item" value={shared} onChange={setShared} draft={sharedDraft}
      onDraftChange={setSharedDraft} existing={existingTags} />
  );

  const onRead = async (e: FormEvent) => {
    e.preventDefault();
    setNothingFound(false);
    try {
      const found = await draftItems.mutateAsync(transcript);
      if (found.length === 0) {
        setNothingFound(true);
        return;
      }
      setDrafts(found.map((d, i) => ({ key: i, form: fromDraft(d), errors: {} })));
      setSaveError(null);
    } catch {
      // draftItems.error is shown in the banner
    }
  };

  const onSaveAll = async () => {
    if (!drafts) return;
    const { inputs, errors } = toInputs(drafts.map((d) => d.form), addTag(shared, parseTagPath(sharedDraft)));
    setDrafts(drafts.map((d, i) => ({ ...d, errors: errors[i] ?? {} })));
    if (!inputs) return;
    setSaving(true);
    setSaveError(null);
    const { saved, error } = await saveInOrder(inputs, createItem);
    setSaving(false);
    if (error) {
      // Keep only what's left, so a retry doesn't save anything twice.
      setDrafts(drafts.slice(saved));
      setSaveError(`${saved > 0 ? `Saved ${saved}, but couldn't save the rest` : "Couldn't save"}: ${error.message}`);
      return;
    }
    // Navigating away unmounts this screen, so nothing writes the drafts back.
    writeSession(KEPT, null);
    toast({ message: saved === 1 ? "Saved 1 item" : `Saved ${saved} items` });
    // In place of the dictation, so Back goes to the Add form, not an empty dictation.
    navigate("/", { replace: true });
  };

  if (drafts === null) {
    return (
      <form onSubmit={onRead} noValidate className="flex flex-1 flex-col gap-5">
        <PageHeader title="Dictate items" back={back}
          summary="Tap the microphone on your keyboard and say what's in front of you. Claude turns it into items for you to check." />
        <TextField label="What's here?" multiline rows={6} value={transcript} onChange={setTranscript} autoFocus
          placeholder="e.g. two camping chairs, a crate of Christmas lights and the old tent, all on shelf 2"
          hint="Say one thing after another. Mention where things are, or what kind, and Claude picks matching tags." />
        {sharedField}
        {nothingFound && <Banner tone="info">Claude didn't find any items in that. Try naming the things you can see.</Banner>}
        {draftItems.error && <Banner>{draftItems.error.message}</Banner>}
        <div className="flex-1" />
        <ActionBar>
          <Button type="submit" variant="primary" block busy={draftItems.isPending} disabled={!transcript.trim()}>
            {draftItems.isPending ? "Reading…" : "Make drafts"}
          </Button>
        </ActionBar>
      </form>
    );
  }

  const update = (key: number, change: (form: ItemForm) => ItemForm) =>
    setDrafts((ds) => ds && ds.map((d) => (d.key === key ? { ...d, form: change(d.form), errors: {} } : d)));
  const remove = (key: number) => setDrafts((ds) => ds && ds.filter((d) => d.key !== key));

  return (
    <div className="flex flex-1 flex-col gap-4">
      <PageHeader title="Check the drafts" back={back}
        summary="Fix anything Claude got wrong, then save. Nothing is saved yet; your drafts are kept until you do."
        actions={<Button variant="ghost" onClick={() => setDrafts(null)} disabled={saving}>Edit dictation</Button>} />
      {sharedField}
      {drafts.length === 0 ? (
        <EmptyState title="No drafts left" action={<Button onClick={() => setDrafts(null)}>Dictate again</Button>}>
          You removed them all.
        </EmptyState>
      ) : (
        drafts.map((d) => (
          <DraftCard key={d.key} form={d.form} errors={d.errors} existingTags={existingTags}
            onChange={(change) => update(d.key, change)} onRemove={() => remove(d.key)}
            typeDimension={typeDimension(tags.data)} propose={(form) => proposeTags({ name: form.name, note: form.note, tags: form.tags })} />
        ))
      )}
      {saveError && <Banner>{saveError}</Banner>}
      <div className="flex-1" />
      <ActionBar>
        <Button variant="primary" block busy={saving} disabled={drafts.length === 0} onClick={onSaveAll}>
          {drafts.length === 1 ? "Save 1 item" : `Save all ${drafts.length} items`}
        </Button>
      </ActionBar>
    </div>
  );
}
