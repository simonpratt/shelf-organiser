// Drafts read from a dictation: turning them into editable forms, checking
// them all before anything is saved, and saving them one by one.
import type { Draft } from "../api/client";
import { formatPath, samePath, type TagPath } from "../tags/path";
import { addTag, emptyForm, hasTagIn, toInput, type FormErrors, type ItemForm, type ItemInput } from "./form";
import { formatLitres, presetFor } from "./size";

export function fromDraft(d: Draft): ItemForm {
  return { ...emptyForm(d.tags), name: d.name, quantity: String(d.quantity), litres: d.litres === null ? "" : String(d.litres) };
}

/** "2 × Crate (40 L)", "35 L" or "No size yet": a draft's size at a glance. */
export function describeSize(form: ItemForm): string {
  const litres = Number(form.litres);
  if (form.litres.trim() === "" || !(litres > 0)) return "No size yet";
  const preset = presetFor(litres);
  const size = preset ? `${preset.label} (${formatLitres(litres)})` : formatLitres(litres);
  return form.quantity === "1" ? size : `${form.quantity} × ${size}`;
}

/**
 * "2 × Crate (40 L) · Location › Shed › Shelf 1": a saved item's size and
 * where it is, to tell apart items of the same name on a review.
 */
export function describeItem(item: { litres: number; quantity: number; tags: { path: TagPath }[] }, location: string | null): string {
  const size = describeSize({ ...emptyForm(), litres: String(item.litres), quantity: String(item.quantity) });
  const where = item.tags.map((t) => t.path).filter((p) => hasTagIn([p], location));
  return [size, ...where.map(formatPath)].join(" · ");
}

/**
 * A draft's tags with the tags shared by the whole dictation, such as the
 * shelf it was all on. A shared tag replaces the draft's own tags in the same
 * dimension, so the shelf the user set wins over one Claude guessed.
 */
export function withShared(tags: TagPath[], shared: TagPath[]): TagPath[] {
  const dims = shared.map((s) => s[0]!.toLowerCase());
  const own = tags.filter((t) => !dims.includes(t[0]!.toLowerCase()) || shared.some((s) => samePath(s, t)));
  return shared.reduce(addTag, own);
}

/**
 * Validates every draft. inputs is set only when all are valid, so a save
 * never stops halfway through on a draft the user could have fixed first.
 */
export function toInputs(forms: ItemForm[], shared: TagPath[] = []): { inputs?: ItemInput[]; errors: FormErrors[] } {
  const results = forms.map((f) => toInput({ ...f, tags: withShared(f.tags, shared) }));
  const errors = results.map((r) => r.errors);
  if (results.some((r) => !r.input)) return { errors };
  return { inputs: results.map((r) => r.input!), errors };
}

/**
 * Saves inputs in order and stops at the first failure, reporting how many
 * were saved so the caller can drop those and keep the rest for a retry.
 */
export async function saveInOrder(inputs: ItemInput[], save: (input: ItemInput) => Promise<unknown>):
  Promise<{ saved: number; error?: Error }> {
  for (let i = 0; i < inputs.length; i++) {
    try {
      await save(inputs[i]!);
    } catch (e) {
      return { saved: i, error: e instanceof Error ? e : new Error(String(e)) };
    }
  }
  return { saved: inputs.length };
}
