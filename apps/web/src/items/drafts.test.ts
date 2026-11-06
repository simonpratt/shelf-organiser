import { describe, expect, it } from "vitest";
import { describeItem, describeSize, fromDraft, saveInOrder, toInputs, withShared } from "./drafts";

const chairs = { name: "Camping chairs", quantity: 2, litres: 40, tags: [["Type", "Camping"]] };

describe("fromDraft", () => {
  it("fills the form, leaving the size blank when Claude gave none", () => {
    expect(fromDraft(chairs)).toMatchObject({ name: "Camping chairs", quantity: "2", litres: "40", tags: [["Type", "Camping"]] });
    expect(fromDraft({ ...chairs, litres: null }).litres).toBe("");
  });
});

describe("describeSize", () => {
  it("names the preset, shows plain litres otherwise, and flags a missing size", () => {
    expect(describeSize(fromDraft(chairs))).toBe("2 × Crate (40 L)");
    expect(describeSize(fromDraft({ ...chairs, quantity: 1, litres: 35 }))).toBe("35 L");
    expect(describeSize(fromDraft({ ...chairs, litres: null }))).toBe("No size yet");
  });
});

describe("withShared", () => {
  it("adds the dictation's shared tags, replacing the draft's own in the same dimension", () => {
    const shelf = ["Location", "Shed", "Shelf 2"];
    expect(withShared([["Type", "Camping"], ["location", "Garage"]], [shelf])).toEqual([["Type", "Camping"], shelf]);
    expect(withShared([shelf], [shelf])).toEqual([shelf]);
    expect(withShared([["Type", "Camping"]], [])).toEqual([["Type", "Camping"]]);
  });
});

describe("toInputs", () => {
  it("gives every draft the shared tags", () => {
    const { inputs } = toInputs([fromDraft(chairs)], [["Location", "Loft"]]);
    expect(inputs?.[0]?.tags).toEqual([["Type", "Camping"], ["Location", "Loft"]]);
  });

  it("returns inputs only when every draft is valid, with errors per draft", () => {
    const ok = fromDraft(chairs);
    const noSize = fromDraft({ ...chairs, name: "Lamp", litres: null });
    const bad = toInputs([ok, noSize]);
    expect(bad.inputs).toBeUndefined();
    expect(bad.errors).toEqual([{}, { litres: "Pick a size or type the litres" }]);
    expect(toInputs([ok]).inputs).toEqual([{ name: "Camping chairs", litres: 40, quantity: 2, note: "", tags: [["Type", "Camping"]] }]);
  });
});

describe("saveInOrder", () => {
  const input = { name: "A", litres: 1, quantity: 1, note: "", tags: [] };

  it("saves every input in order", async () => {
    const names: string[] = [];
    const res = await saveInOrder([{ ...input, name: "A" }, { ...input, name: "B" }], async (i) => names.push(i.name));
    expect(res).toEqual({ saved: 2 });
    expect(names).toEqual(["A", "B"]);
  });

  it("stops at the first failure and says how many were saved", async () => {
    const tried: string[] = [];
    const res = await saveInOrder([{ ...input, name: "A" }, { ...input, name: "B" }, { ...input, name: "C" }], async (i) => {
      tried.push(i.name);
      if (i.name === "B") throw new Error("offline");
    });
    expect(res.saved).toBe(1);
    expect(res.error?.message).toBe("offline");
    expect(tried).toEqual(["A", "B"]);
  });
});

it("describes a saved item by its size and where it is", () => {
  const tags = [{ path: ["Type", "Camping"] }, { path: ["Location", "Shed", "Shelf 1"] }];
  expect(describeItem({ litres: 40, quantity: 2, tags }, "Location")).toBe("2 × Crate (40 L) · Location › Shed › Shelf 1");
  expect(describeItem({ litres: 35, quantity: 1, tags }, null)).toBe("35 L");
});
