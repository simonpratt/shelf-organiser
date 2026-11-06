// Organise (T5, ADR 0002): Claude proposes a Type tag for each item without
// one, building out the Type tree as it goes; the user edits or leaves out
// proposals, and Apply adds the rest in one go. Nothing changes until then.
// The review is kept for the tab, so Back or a reload loses nothing.
import { useEffect, useState } from "react";
import { useGoBack } from "../back";
import { useClaude, useOrganise } from "../api/claude";
import { useAddItemTags, useItems } from "../api/items";
import { useTags } from "../api/tags";
import { ActionBar } from "../components/ActionBar";
import { AppShell } from "../components/AppShell";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { SparkleIcon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { ProposalCard } from "../components/ProposalCard";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { readSession, writeSession } from "../session/store";
import { toAssignments, toReview, type Reviewed } from "../tags/proposals";

const back = { to: "/", label: "Back to items" };

export function OrganisePage() {
  const claude = useClaude();
  return (
    <AppShell nav={false}>
      {claude.isPending ? (
        <><PageHeader title="Organise" back={back} /><Skeleton rows={3} label="Loading" /></>
      ) : claude.isError ? (
        <><PageHeader title="Organise" back={back} />
          <Banner action={<Button onClick={() => claude.refetch()}>Retry</Button>}>Couldn't check for Claude: {claude.error.message}</Banner></>
      ) : !claude.data.enabled ? (
        <><PageHeader title="Organise" back={back} />
          <EmptyState title="Organise isn't set up" action={<Button to="/">Back to items</Button>}>
            It needs an Anthropic API key in the server's ANTHROPIC_API_KEY setting. You can still tag items by hand.
          </EmptyState></>
      ) : (
        <Organise />
      )}
    </AppShell>
  );
}

type Kept = { dimension: string; remaining: number; rows: Reviewed[] } | null;
const KEPT = "organise";

function Organise() {
  const goBack = useGoBack();
  const toast = useToast();
  const items = useItems();
  const tags = useTags();
  const organise = useOrganise();
  const apply = useAddItemTags();
  const [kept, setKept] = useState<Kept>(() => readSession<Kept>(KEPT, null));
  useEffect(() => writeSession(KEPT, kept), [kept]);
  const count = items.data?.length ?? 0;

  const onPropose = async () => {
    try {
      const res = await organise.mutateAsync();
      setKept({ dimension: res.dimension, remaining: res.remaining, rows: toReview(res.proposals, items.data ?? []) });
    } catch {
      // organise.error is shown in the banner
    }
  };

  if (kept === null) {
    return (
      <div className="flex flex-1 flex-col gap-5">
        <PageHeader title="Organise" back={back}
          summary="Claude proposes a Type tag, such as Type › Garden, for each item without one, adding to your tags where it needs to. Where things are stays yours to say." />
        {items.isPending ? (
          <Skeleton rows={2} label="Loading items" />
        ) : items.isError ? (
          <Banner action={<Button onClick={() => items.refetch()}>Retry</Button>}>Couldn't load items: {items.error.message}</Banner>
        ) : count === 0 ? (
          <EmptyState title="Nothing to organise yet" action={<Button to="/items/new" variant="primary">Add an item</Button>}>
            Add a few items first.
          </EmptyState>
        ) : organise.isPending ? (
          <Skeleton rows={4} label={`Claude is reading ${count === 1 ? "1 item" : `${count} items`}`} />
        ) : (
          <p className="text-muted">
            Claude reads all {count === 1 ? "1 item" : `${count} items`}, biggest first. You check every proposal before anything changes.
          </p>
        )}
        {organise.error && <Banner>{organise.error.message}</Banner>}
        <div className="flex-1" />
        <ActionBar>
          <Button variant="primary" block icon={<SparkleIcon />} busy={organise.isPending} disabled={count === 0}
            onClick={onPropose}>
            {organise.isPending ? "Reading…" : "Propose tags"}
          </Button>
        </ActionBar>
      </div>
    );
  }

  const { dimension, remaining, rows } = kept;
  const assignments = toAssignments(rows);
  const setRows = (next: Reviewed[]) => setKept({ ...kept, rows: next });

  const onApply = async () => {
    try {
      await apply.mutateAsync(assignments);
    } catch {
      return; // apply.error is shown in the banner
    }
    // Navigating away unmounts this screen, so nothing writes the review back.
    writeSession(KEPT, null);
    toast({ message: assignments.length === 1 ? "Tagged 1 item" : `Tagged ${assignments.length} items` });
    goBack("/");
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <PageHeader title="Check the proposals" back={back}
        summary={`Claude proposes a ${dimension} tag for each item below. Edit or leave out any, then apply. Nothing changes until you do.`}
        actions={<Button variant="ghost" onClick={() => setKept(null)} disabled={apply.isPending}>Start over</Button>} />
      {rows.length === 0 ? (
        <EmptyState title="Nothing to propose" action={<Button to="/">Back to items</Button>}>
          {remaining > 0
            ? `Claude couldn't place the ${remaining === 1 ? "item" : `${remaining} items`} without a ${dimension} tag. Tag ${remaining === 1 ? "it" : "them"} by hand.`
            : `Every item already has a ${dimension} tag.`}
        </EmptyState>
      ) : (
        rows.map((r, i) => (
          <ProposalCard key={r.itemId} name={r.name} tags={r.tags} existingTags={(tags.data ?? []).map((t) => t.path)}
            onChange={(t) => setRows(rows.map((x, j) => (j === i ? { ...x, tags: t } : x)))}
            onRemove={() => setRows(rows.filter((_, j) => j !== i))} />
        ))
      )}
      {rows.length > 0 && remaining > 0 && (
        <Banner tone="info">
          {remaining === 1 ? "1 more item has" : `${remaining} more items have`} no {dimension} tag yet. Organise again after
          applying, or tag {remaining === 1 ? "it" : "them"} by hand.
        </Banner>
      )}
      {apply.error && <Banner>Couldn't apply: {apply.error.message}</Banner>}
      <div className="flex-1" />
      {rows.length > 0 && (
        <ActionBar>
          <Button variant="primary" block busy={apply.isPending} disabled={assignments.length === 0} onClick={onApply}>
            {assignments.length === 1 ? "Apply to 1 item" : `Apply to ${assignments.length} items`}
          </Button>
        </ActionBar>
      )}
    </div>
  );
}
