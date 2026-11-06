import { describe, expect, it } from "vitest";
import { addTag, carriedTags, emptyForm, fromItem, hasTagIn, toInput, typeDimension } from "./form";

describe("toInput", () => {
  it("builds the API input, trimming text", () => {
    const form = { ...emptyForm(), name: " Tent ", litres: "30", quantity: "2", note: " green " };
    expect(toInput(form)).toEqual({
      input: { name: "Tent", litres: 30, quantity: 2, note: "green", tags: [] },
      errors: {},
    });
  });

  it("reports every invalid field at once", () => {
    const { input, errors } = toInput({ ...emptyForm(), litres: "0", quantity: "1.5" });
    expect(input).toBeUndefined();
    expect(Object.keys(errors).sort()).toEqual(["litres", "name", "quantity"]);
  });

  it("keeps text left in the tag field as a tag", () => {
    const form = { ...emptyForm([["Location", "Shed"]]), name: "Tent", litres: "30", tagDraft: "Type/Camping" };
    expect(toInput(form).input?.tags).toEqual([["Location", "Shed"], ["Type", "Camping"]]);
  });
});

it("adds a tag once, ignoring case and empty paths", () => {
  expect(addTag([["Type"]], ["type"])).toEqual([["Type"]]);
  expect(addTag([["Type"]], [])).toEqual([["Type"]]);
  expect(addTag([], ["Type"])).toEqual([["Type"]]);
});

it("round-trips an item into the form", () => {
  const form = fromItem({ name: "Tent", litres: 2.5, quantity: 3, note: "", tags: [{ path: ["Type"] }] });
  expect(toInput(form).input).toEqual({ name: "Tent", litres: 2.5, quantity: 3, note: "", tags: [["Type"]] });
});

it("carries every tag but the Type dimension's to the next item", () => {
  const tags = [["Location", "Shed", "Wall rack"], ["Type", "Tools", "Power tools"], ["Project", "Deck"]];
  expect(carriedTags(tags, "type")).toEqual([["Location", "Shed", "Wall rack"], ["Project", "Deck"]]);
  expect(carriedTags(tags, null)).toEqual(tags);
});

it("names the Type dimension the server marked, or none", () => {
  expect(typeDimension([{ name: "Location", isTypeDimension: false }, { name: "Stuff", isTypeDimension: true }])).toBe("Stuff");
  expect(typeDimension([{ name: "Location", isTypeDimension: false }])).toBeNull();
  expect(typeDimension(undefined)).toBeNull();
});

it("tells whether an item has a tag in a dimension, ignoring case", () => {
  expect(hasTagIn([["Location", "Shed"], ["Type", "Garden"]], "type")).toBe(true);
  expect(hasTagIn([["Location", "Shed"]], "Type")).toBe(false);
  expect(hasTagIn([["Type", "Garden"]], null)).toBe(false);
});
