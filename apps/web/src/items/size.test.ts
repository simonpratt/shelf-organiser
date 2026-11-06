import { describe, expect, it } from "vitest";
import { checkLitres, formatLitres, parseLitres, presetFor, totalLitres } from "./size";

describe("parseLitres", () => {
  it.each([
    ["12", 12],
    [" 2.5 ", 2.5],
    ["2,5", 2.5],
    ["3.", 3],
    [".5", 0.5],
  ])("reads %j as %d", (draft, want) => expect(parseLitres(draft)).toBe(want));

  it.each(["", "0", "-4", "abc", "1.2.3", "1e3"])("rejects %j", (draft) => expect(parseLitres(draft)).toBeNull());
});

describe("formatLitres", () => {
  it("groups thousands and drops decimals at 10 L and above", () => {
    expect(formatLitres(1250.4)).toBe("1,250 L");
  });
  it("keeps one decimal below 10 L", () => {
    expect(formatLitres(2.54)).toBe("2.5 L");
    expect(formatLitres(8)).toBe("8 L");
  });
});

describe("sizes", () => {
  it("multiplies litres by quantity for total space", () => {
    expect(totalLitres({ litres: 40, quantity: 3 })).toBe(120);
  });
  it("matches a preset only on its exact volume", () => {
    expect(presetFor(40)?.id).toBe("crate");
    expect(presetFor(41)).toBeUndefined();
    expect(presetFor(null)).toBeUndefined();
  });
});

describe("checkLitres", () => {
  it("says zero can't be saved", () => {
    expect(checkLitres("0")).toEqual({ error: "Must be more than 0" });
    expect(checkLitres("0,0")).toEqual({ error: "Must be more than 0" });
  });
  it("gently questions a size above 1,000 L but not one at it", () => {
    expect(checkLitres("99999").note).toMatch(/check the number/);
    expect(checkLitres("1000")).toEqual({});
  });
  it("says nothing while blank or not yet a number", () => {
    expect(checkLitres("")).toEqual({});
    expect(checkLitres("2.")).toEqual({});
  });
});
