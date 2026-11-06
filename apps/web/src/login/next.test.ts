import { describe, expect, it } from "vitest";
import { loginUrl, safeNext } from "./next";

describe("loginUrl", () => {
  it("remembers the screen to return to, search and all", () => {
    expect(loginUrl("/tags")).toBe("/login?next=%2Ftags");
    expect(loginUrl("/?q=tent&tag=3")).toBe("/login?next=%2F%3Fq%3Dtent%26tag%3D3");
  });

  it("leaves next off for the item list and the login page itself", () => {
    expect(loginUrl("/")).toBe("/login");
    expect(loginUrl("/login?next=%2Ftags")).toBe("/login");
  });
});

describe("safeNext", () => {
  it("returns a path in this app", () => {
    expect(safeNext("/items/3")).toBe("/items/3");
    expect(safeNext("/?q=tent")).toBe("/?q=tent");
  });

  it("falls back to the item list for anything else", () => {
    for (const next of [null, "", "tags", "https://evil.example", "//evil.example", "/\\evil.example", "/a\nb", "/login"]) {
      expect(safeNext(next), String(next)).toBe("/");
    }
  });
});
