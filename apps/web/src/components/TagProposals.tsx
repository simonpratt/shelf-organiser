// Claude's proposed tags for one item (T5, ADR 0002): a Suggest tags button,
// then the proposals as chips that add a tag when tapped. Nothing is added
// without a tap. It hides while the item has a tag in the Type dimension, and
// comes back when that tag is removed. Give it a key of the item's name, so
// proposals never outlive the name they were made for.
import { useState } from "react";
import type { ProposedTag } from "../api/client";
import type { TagPath } from "../tags/path";
import { hasTagIn } from "../items/form";
import { unchosen } from "../tags/proposals";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { SparkleIcon } from "./icons";
import { TagChip } from "./TagChip";

type Props = {
  /** Asks Claude; rejects with a readable message. */
  propose: () => Promise<{ dimension: string; tags: ProposedTag[] }>;
  /** The Type dimension, when the tag tree has one. */
  typeDimension: string | null;
  /** False until the item has a name to go on. */
  ready: boolean;
  /** The item's tags so far: proposals among them are hidden. */
  chosen: TagPath[];
  onAdd: (path: TagPath) => void;
};

type State = { is: "idle" | "busy" } | { is: "done"; dimension: string; tags: ProposedTag[] } | { is: "error"; message: string };

export function TagProposals({ propose, typeDimension, ready, chosen, onAdd }: Props) {
  const [state, setState] = useState<State>({ is: "idle" });
  const run = async () => {
    if (!ready) {
      setState({ is: "error", message: "Name the item first, then Claude can suggest tags." });
      return;
    }
    setState({ is: "busy" });
    try {
      setState({ is: "done", ...(await propose()) });
    } catch (e) {
      setState({ is: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  // A dimension Claude just started ("Type") counts before any tag in it is saved.
  if (hasTagIn(chosen, typeDimension ?? (state.is === "done" ? state.dimension : null))) return null;
  const shown = state.is === "done" ? unchosen(state.tags, chosen) : [];
  if (shown.length > 0) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <p className="text-sm text-muted">Claude suggests (tap to add):</p>
        <ul aria-label="Suggested tags" className="flex flex-wrap gap-2">
          {shown.map((t) => (
            <li key={t.path.join("/")} className="max-w-full">
              <TagChip path={t.path} isNew={t.isNew} onAdd={() => onAdd(t.path)} />
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="ghost" icon={<SparkleIcon />} busy={state.is === "busy"} onClick={run} className="-ml-4">
        {state.is === "busy" ? "Asking Claude…" : "Suggest tags"}
      </Button>
      {state.is === "error" && <Banner tone={ready ? "error" : "info"}>{state.message}</Banner>}
      {state.is === "done" && <p role="status" className="text-sm text-muted">Claude has nothing to suggest for this item.</p>}
    </div>
  );
}
