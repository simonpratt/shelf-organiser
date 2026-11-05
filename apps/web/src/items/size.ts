// Item sizes: the presets offered for quick entry on a phone, and how volumes
// are shown. Domain decision: presets map to litres; the item stores litres.

export type SizePreset = { id: string; label: string; example: string; litres: number };

export const SIZE_PRESETS: readonly SizePreset[] = [
  { id: "shoebox", label: "Shoebox", example: "shoes, cables", litres: 10 },
  { id: "crate", label: "Crate", example: "milk crate", litres: 40 },
  { id: "bin", label: "Storage bin", example: "plastic tub", litres: 70 },
  { id: "large-box", label: "Large box", example: "moving box", litres: 120 },
  { id: "bulky", label: "Bulky", example: "furniture, bikes", litres: 500 },
];

/** The preset whose volume is exactly litres, if any. */
export function presetFor(litres: number | null): SizePreset | undefined {
  return SIZE_PRESETS.find((p) => p.litres === litres);
}

const whole = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

/** "1,250 L"; volumes under 10 L keep one decimal place ("2.5 L"). */
export function formatLitres(litres: number): string {
  return `${(litres < 10 ? oneDecimal : whole).format(litres)} L`;
}

/** Total space an item takes: one unit's litres times the quantity. */
export function totalLitres(item: { litres: number; quantity: number }): number {
  return item.litres * item.quantity;
}

/** Parses a typed volume, accepting a decimal comma; null unless it is a positive number. */
export function parseLitres(draft: string): number | null {
  const text = draft.trim().replace(",", ".");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(text)) return null;
  const n = Number(text);
  return n > 0 ? n : null;
}
