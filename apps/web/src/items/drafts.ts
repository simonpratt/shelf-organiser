// Drafts read from a dictation: turning them into editable forms, checking
// them all before anything is saved, and saving them one by one.
import type { Draft } from "../api/client";
import { emptyForm, toInput, type FormErrors, type ItemForm, type ItemInput } from "./form";
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
 * Validates every draft. inputs is set only when all are valid, so a save
 * never stops halfway through on a draft the user could have fixed first.
 */
export function toInputs(forms: ItemForm[]): { inputs?: ItemInput[]; errors: FormErrors[] } {
  const results = forms.map(toInput);
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
