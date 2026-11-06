// The add/edit item form: its draft state and validation into the API input.
import { parseTagPath, samePath, type TagPath } from "../tags/path";
import { parseLitres } from "./size";

export type ItemForm = {
  name: string;
  litres: string; // draft, so "2." stays editable
  quantity: string;
  note: string;
  tags: TagPath[];
  tagDraft: string; // text still in the tag field
};

export type ItemInput = { name: string; litres: number; quantity: number; note: string; tags: TagPath[] };
export type FormErrors = Partial<Record<"name" | "litres" | "quantity", string>>;

export function emptyForm(tags: TagPath[] = []): ItemForm {
  return { name: "", litres: "", quantity: "1", note: "", tags, tagDraft: "" };
}

export function fromItem(item: { name: string; litres: number; quantity: number; note: string; tags: { path: TagPath }[] }): ItemForm {
  return {
    name: item.name,
    litres: String(item.litres),
    quantity: String(item.quantity),
    note: item.note,
    tags: item.tags.map((t) => t.path),
    tagDraft: "",
  };
}

/** Adds path to tags unless it is empty or already there (ignoring case). */
export function addTag(tags: TagPath[], path: TagPath): TagPath[] {
  if (path.length === 0 || tags.some((t) => samePath(t, path))) return tags;
  return [...tags, path];
}

/** The name of the Type dimension, if the tag tree has one. */
export function typeDimension(tags: readonly { name: string; isTypeDimension: boolean }[] | undefined): string | null {
  return tags?.find((t) => t.isTypeDimension)?.name ?? null;
}

/** The name of the Location dimension, if the tag tree has one. */
export function locationDimension(tags: readonly { name: string; isLocationDimension: boolean }[] | undefined): string | null {
  return tags?.find((t) => t.isLocationDimension)?.name ?? null;
}

/** True when one of tags is in dimension (null: there is no such dimension). */
export function hasTagIn(tags: TagPath[], dimension: string | null): boolean {
  return dimension !== null && tags.some((t) => t[0]?.toLowerCase() === dimension.toLowerCase());
}

/**
 * The tags Save and add another keeps for the next item, which is usually
 * from the same shelf but rarely the same kind of thing, or the same plan
 * for it: only those in the Location dimension (none while there is none).
 */
export function carriedTags(tags: TagPath[], location: string | null): TagPath[] {
  return tags.filter((t) => hasTagIn([t], location));
}

export function toInput(form: ItemForm): { input?: ItemInput; errors: FormErrors } {
  const errors: FormErrors = {};
  const name = form.name.trim();
  if (name === "") errors.name = "Give the item a name";
  const litres = parseLitres(form.litres);
  if (litres === null) errors.litres = "Pick a size or type the litres";
  const quantity = Number(form.quantity.trim());
  if (!Number.isInteger(quantity) || quantity < 1) errors.quantity = "Quantity must be a whole number, 1 or more";
  if (Object.keys(errors).length > 0) return { errors };
  return {
    // Text left in the tag field counts as a tag, so it isn't silently lost on save.
    input: { name, litres: litres!, quantity, note: form.note.trim(), tags: addTag(form.tags, parseTagPath(form.tagDraft)) },
    errors,
  };
}
