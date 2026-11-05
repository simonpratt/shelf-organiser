// What takes up the space (T3, T4): a nested treemap of the breakdown by the
// chosen dimension (or every item, for All items), opened at one level, with
// a breadcrumb back up and that level's blocks as a list (the text and
// screen-reader view). Dimension and level live in the URL,
// so Back steps back out and a view can be bookmarked.
import { useNavigate, useSearchParams } from "react-router";
import { useItems } from "../api/items";
import { useTags } from "../api/tags";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/Banner";
import { Breadcrumb } from "../components/Breadcrumb";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { PlusIcon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { Select } from "../components/Select";
import { Skeleton } from "../components/Skeleton";
import { SpaceRow } from "../components/SpaceRow";
import { Treemap } from "../components/Treemap";
import { formatLitres } from "../items/size";
import { breakdown, formatShare, trail, type Block } from "../space/breakdown";

const ALL = "all";

export function SpacePage() {
  const items = useItems();
  const tags = useTags();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const dimensions = (tags.data ?? []).filter((t) => t.parentId === null);
  // Opens on the first dimension; All items is the ungrouped view.
  const d = params.get("d");
  const dimension = d === ALL ? null : dimensions.find((t) => String(t.id) === d) ?? dimensions[0] ?? null;

  const link = (key: string | null, dimensionId = dimension ? String(dimension.id) : ALL) => {
    const p = new URLSearchParams({ d: dimensionId });
    if (key && key !== "root") p.set("at", key);
    return `/space?${p}`;
  };
  const blockLink = (b: Block) => (b.kind === "item" ? `/items/${b.id}` : link(b.key));

  if (items.isPending || tags.isPending) {
    return <AppShell><PageHeader title="Space" /><Skeleton label="Loading items" /></AppShell>;
  }
  if (items.isError || tags.isError) {
    const error = items.error ?? tags.error;
    return (
      <AppShell>
        <PageHeader title="Space" />
        <Banner action={<Button onClick={() => { void items.refetch(); void tags.refetch(); }}>Retry</Button>}>
          Couldn't load items: {error?.message}
        </Banner>
      </AppShell>
    );
  }
  if (items.data.length === 0) {
    return (
      <AppShell>
        <PageHeader title="Space" />
        <EmptyState title="Nothing to map yet" action={<Button to="/items/new" variant="primary" icon={<PlusIcon />}>Add your first item</Button>}>
          Add items with a size and some tags, and this shows what takes up the space.
        </EmptyState>
      </AppShell>
    );
  }

  const root = breakdown(items.data, tags.data, dimension?.id ?? null);
  const path = trail(root, params.get("at"));
  const current = path.at(-1) ?? root;
  const parent = path.at(-2);
  const summary = `${formatLitres(current.litres)} in ${current.itemCount === 1 ? "1 item" : `${current.itemCount} items`}` +
    (parent ? ` · ${formatShare(current.litres, parent.litres)} of ${parent.name}` : "");

  return (
    <AppShell>
      <PageHeader title={path.length > 1 ? current.name : "Space"} summary={summary} />
      <Select label="Dimension" value={dimension ? String(dimension.id) : ALL} onChange={(v) => navigate(link(null, v))}
        options={[...dimensions.map((t) => ({ value: String(t.id), label: t.name })), { value: ALL, label: "All items" }]} />
      {path.length > 1 && <Breadcrumb trail={path.map((b) => ({ key: b.key, label: b.name, to: link(b.key) }))} />}
      <Treemap blocks={current.children} linkTo={blockLink} />
      <ul className="flex flex-col gap-2" aria-label="Breakdown">
        {current.children.map((b) => (
          <li key={b.key}>
            <SpaceRow to={blockLink(b)} kind={b.kind} name={b.name} litres={b.litres} itemCount={b.itemCount}
              share={formatShare(b.litres, current.litres)} fraction={current.litres > 0 ? b.litres / current.litres : 0} />
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
