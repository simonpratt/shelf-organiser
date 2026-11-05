// The item list: everything in the shed, largest total space first, with
// search and a tag filter kept in the URL so Back returns to the same view.
// T5: with Claude set up, Organise proposes Type tags for untyped items.
import { useSearchParams } from "react-router";
import { useClaude } from "../api/claude";
import { useItems } from "../api/items";
import { useTags } from "../api/tags";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { Fab } from "../components/Fab";
import { PlusIcon, SparkleIcon } from "../components/icons";
import { ItemRow } from "../components/ItemRow";
import { PageHeader } from "../components/PageHeader";
import { SearchField } from "../components/SearchField";
import { Select } from "../components/Select";
import { Skeleton } from "../components/Skeleton";
import { filterItems, summarise } from "../items/filter";
import { formatLitres } from "../items/size";
import { formatPath } from "../tags/path";

export function ItemsPage() {
  const items = useItems();
  const tags = useTags();
  const claude = useClaude();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const tagParam = params.get("tag");
  const tagId = tagParam && tags.data?.some((t) => String(t.id) === tagParam) ? Number(tagParam) : null;

  const setParam = (key: string, value: string) =>
    setParams((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
      return p;
    }, { replace: true });

  const all = items.data ?? [];
  const shown = filterItems(all, tags.data ?? [], { query, tagId });
  const total = summarise(all);
  const filtered = summarise(shown);
  const isFiltered = query !== "" || tagId !== null;
  const summary = items.data
    ? isFiltered
      ? `${filtered.count} of ${plural(total.count)} · ${formatLitres(filtered.totalLitres)}`
      : `${plural(total.count)} · ${formatLitres(total.totalLitres)}`
    : undefined;

  return (
    <AppShell>
      <PageHeader title="Items" summary={summary}
        actions={claude.data?.enabled && all.length > 0 && <Button variant="ghost" to="/organise" icon={<SparkleIcon />}>Organise</Button>} />
      {all.length > 0 && (
        <div className="flex flex-col gap-2">
          <SearchField label="Search items" placeholder="Search names, notes, tags" value={query} onChange={(v) => setParam("q", v)} />
          <Select label="Filter by tag" hideLabel value={tagId === null ? "" : String(tagId)} onChange={(v) => setParam("tag", v)}
            options={[{ value: "", label: "All tags" }, ...(tags.data ?? []).map((t) => ({ value: String(t.id), label: formatPath(t.path) }))]} />
        </div>
      )}
      {items.isPending ? (
        <Skeleton label="Loading items" />
      ) : items.isError ? (
        <Banner action={<Button onClick={() => items.refetch()}>Retry</Button>}>Couldn't load items: {items.error.message}</Banner>
      ) : all.length === 0 ? (
        <EmptyState title="Nothing here yet" action={<Button to="/items/new" variant="primary" icon={<PlusIcon />}>Add your first item</Button>}>
          Add what's in your shed or back room, pick a size, and tag it to see what takes up the space.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title="No items match" action={<Button onClick={() => setParams({}, { replace: true })}>Clear search and filter</Button>} />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Items">
          {shown.map((it) => (
            <li key={it.id}>
              <ItemRow to={`/items/${it.id}`} name={it.name} litres={it.litres} quantity={it.quantity} tags={it.tags} />
            </li>
          ))}
        </ul>
      )}
      {all.length > 0 && <Fab to="/items/new" label="Add item" icon={<PlusIcon />} />}
    </AppShell>
  );
}

function plural(n: number) {
  return n === 1 ? "1 item" : `${n} items`;
}
