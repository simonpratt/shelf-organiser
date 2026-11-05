// The component catalogue at /dev/components (dev builds only): every shared
// component with each of its variants. dev/catalogue.test.ts fails when a
// component file is missing from here.
import { useState, type ReactNode } from "react";
import { fromDraft } from "../items/drafts";
import { ActionBar } from "../components/ActionBar";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/Banner";
import { Breadcrumb } from "../components/Breadcrumb";
import { BottomNav } from "../components/BottomNav";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Dialog } from "../components/Dialog";
import { DraftCard } from "../components/DraftCard";
import { EmptyState } from "../components/EmptyState";
import { Fab } from "../components/Fab";
import { BackIcon, BoxIcon, ChevronIcon, CloseIcon, MapIcon, MicIcon, MinusIcon, PlusIcon, SearchIcon, TagIcon } from "../components/icons";
import { ItemRow } from "../components/ItemRow";
import { PageHeader } from "../components/PageHeader";
import { QuantityStepper } from "../components/QuantityStepper";
import { SearchField } from "../components/SearchField";
import { Select } from "../components/Select";
import { SizePicker } from "../components/SizePicker";
import { Skeleton } from "../components/Skeleton";
import { SpaceRow } from "../components/SpaceRow";
import { Spinner } from "../components/Spinner";
import { TagChip } from "../components/TagChip";
import { TagInput } from "../components/TagInput";
import { TagTreeRow } from "../components/TagTreeRow";
import { TextField } from "../components/TextField";
import { Toast } from "../components/Toast";
import { Treemap } from "../components/Treemap";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-accent">{title}</h2>
      {children}
    </section>
  );
}

/** Contains fixed-position components (nav, FAB) inside a box. */
function Frame({ children }: { children: ReactNode }) {
  return <div className="relative h-32 overflow-hidden rounded-md border border-border [transform:translateZ(0)]">{children}</div>;
}

export default function ComponentsPage() {
  const [text, setText] = useState("Camping chairs");
  const [litres, setLitres] = useState("40");
  const [qty, setQty] = useState("2");
  const [tags, setTags] = useState([["Location", "Shed"]]);
  const [draft, setDraft] = useState("");
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [draftForm, setDraftForm] = useState(() =>
    fromDraft({ name: "Camping chairs", quantity: 2, litres: 40, tags: [["Location", "Shed"]] }));
  const existing = [["Location"], ["Location", "Shed"], ["Type"], ["Type", "Camping"]];

  return (
    <AppShell nav={false}>
      <PageHeader title="Components" summary="Every shared component and its variants" back={{ to: "/", label: "Back" }}
        actions={<Button variant="ghost">Action</Button>} />
      <Section title="Button">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" busy>Busy</Button>
          <Button disabled>Disabled</Button>
          <Button icon={<PlusIcon />} aria-label="Icon only" />
          <Button to="/" icon={<BackIcon />}>Link</Button>
        </div>
        <Button variant="primary" block>Block</Button>
        <Button block size="lg" icon={<MicIcon />}>Large</Button>
      </Section>
      <Section title="icons">
        <div className="flex gap-3"><PlusIcon /><MinusIcon /><CloseIcon /><BackIcon /><SearchIcon /><BoxIcon /><TagIcon /><ChevronIcon /><MicIcon /><MapIcon /></div>
      </Section>
      <Section title="Spinner"><Spinner /><Spinner label="Saving…" /></Section>
      <Section title="TextField">
        <TextField label="Name" value={text} onChange={setText} />
        <TextField label="With hint" value="" onChange={() => {}} hint="A hint below the field" placeholder="Placeholder" />
        <TextField label="With error" value="" onChange={() => {}} error="Give the item a name" />
        <TextField label="With suffix" value="25" onChange={() => {}} suffix="L" />
        <TextField label="With action" value="" onChange={() => {}} hint="The button lines up with the input"
          action={<Button variant="primary">Add</Button>} />
        <TextField label="Multiline" multiline value="A note" onChange={() => {}} />
      </Section>
      <Section title="SearchField"><SearchField label="Search" value={text} onChange={setText} placeholder="Search" /></Section>
      <Section title="Select">
        <Select label="Visible label" value="a" onChange={() => {}} options={[{ value: "a", label: "All tags" }]} />
        <Select label="With hint" value="a" onChange={() => {}} options={[{ value: "a", label: "All tags" }]} hint="A hint below the select" />
        <Select label="Hidden label" hideLabel value="a" onChange={() => {}} options={[{ value: "a", label: "All tags" }]} />
      </Section>
      <Section title="SizePicker">
        <SizePicker litres={litres} onChange={setLitres} />
        <SizePicker litres="" onChange={() => {}} error="Pick a size or type the litres" />
      </Section>
      <Section title="QuantityStepper">
        <QuantityStepper value={qty} onChange={setQty} />
        <QuantityStepper value="0" onChange={() => {}} error="Quantity must be a whole number, 1 or more" />
      </Section>
      <Section title="TagChip">
        <div className="flex gap-2"><TagChip path={["Type", "Camping"]} /><TagChip path={["Location", "Shed"]} onRemove={() => {}} /></div>
      </Section>
      <Section title="TagInput">
        <TagInput value={tags} onChange={setTags} draft={draft} onDraftChange={setDraft} existing={existing} />
      </Section>
      <Section title="Banner">
        <Banner>Couldn't save: name is required</Banner>
        <Banner tone="info" action={<Button>Retry</Button>}>Information with an action</Banner>
      </Section>
      <Section title="EmptyState">
        <EmptyState title="Nothing here yet" action={<Button variant="primary">Add item</Button>}>Body text</EmptyState>
        <EmptyState title="Title only" />
      </Section>
      <Section title="Skeleton"><Skeleton rows={2} /></Section>
      <Section title="Dialog and ConfirmDialog">
        <div className="flex gap-2">
          <Button onClick={() => setDialog(true)}>Open dialog</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>Open confirm</Button>
        </div>
        <Dialog open={dialog} onClose={() => setDialog(false)} title="Dialog">
          <p>Content</p>
          <Button onClick={() => setDialog(false)}>Close</Button>
        </Dialog>
        <ConfirmDialog open={confirm} title="Delete “Shed”?" confirmLabel="Delete tag" error="Example error"
          onConfirm={() => setConfirm(false)} onCancel={() => setConfirm(false)}>
          This also deletes the 2 tags inside it.
        </ConfirmDialog>
      </Section>
      <Section title="Toast">
        <Toast message="Saved “Tent”" onDismiss={() => {}} />
        <Toast message="Deleted “Tent”" action={{ label: "Undo", onClick: () => {} }} onDismiss={() => {}} />
      </Section>
      <Section title="ItemRow">
        <ItemRow to="#" name="Tent" litres={30} quantity={2} tags={[{ id: 1, path: ["Type", "Camping"] }]} />
        <ItemRow to="#" name="Lamp" litres={2.5} quantity={1} tags={[]} />
      </Section>
      <Section title="DraftCard">
        <DraftCard form={draftForm} onChange={setDraftForm} onRemove={() => {}} errors={{}} existingTags={existing} />
        <DraftCard form={fromDraft({ name: "Lamp", quantity: 1, litres: null, tags: [] })} onChange={() => {}}
          onRemove={() => {}} errors={{ litres: "Pick a size or type the litres" }} existingTags={existing} />
        <DraftCard form={draftForm} onChange={setDraftForm} onRemove={() => {}} errors={{}} existingTags={existing} defaultOpen />
      </Section>
      <Section title="TagTreeRow">
        <div>
          <TagTreeRow name="Location" depth={0} itemCount={0} totalSpace={0} onSelect={() => {}} />
          <TagTreeRow name="Shed" depth={1} itemCount={12} totalSpace={640} onSelect={() => {}} />
          <TagTreeRow name="Shelf 2" depth={2} itemCount={1} totalSpace={40} onSelect={() => {}} />
        </div>
      </Section>
      <Section title="Treemap">
        <Treemap blocks={[
          { key: "tag:1", kind: "tag", name: "Shed", litres: 640, share: "58%", to: "#" },
          { key: "untagged", kind: "untagged", name: "Untagged", litres: 300, share: "27%", to: "#" },
          { key: "item:1", kind: "item", name: "Bike", litres: 120, share: "11%", to: "#" },
          { key: "item:2", kind: "item", name: "Lamp", litres: 40, share: "4%", to: "#" },
          { key: "item:3", kind: "item", name: "Torch", litres: 2, share: "<1%", to: "#" },
        ]} />
      </Section>
      <Section title="SpaceRow">
        <SpaceRow to="#" kind="tag" name="Shed" litres={640} itemCount={12} share="58%" fraction={0.58} />
        <SpaceRow to="#" kind="untagged" name="Untagged" litres={300} itemCount={1} share="27%" fraction={0.27} />
        <SpaceRow to="#" kind="item" name="Torch" litres={2} itemCount={1} share="<1%" fraction={0.002} />
      </Section>
      <Section title="Breadcrumb">
        <Breadcrumb trail={[{ key: "root", label: "Location", to: "#" }, { key: "tag:2", label: "Shed", to: "#" }, { key: "tag:3", label: "Shelf 2", to: "#" }]} />
      </Section>
      <Section title="BottomNav"><Frame><BottomNav /></Frame></Section>
      <Section title="Fab"><Frame><Fab to="#" label="Add item" icon={<PlusIcon />} /></Frame></Section>
      <Section title="ActionBar">
        <ActionBar><Button variant="primary" block>Save</Button><Button block>Save and add another</Button></ActionBar>
      </Section>
      <Section title="AppShell"><p className="text-muted">This page is rendered inside AppShell (without the nav).</p></Section>
    </AppShell>
  );
}
