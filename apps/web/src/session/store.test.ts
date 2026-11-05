import { afterEach, describe, expect, it, vi } from "vitest";
import { readSession, writeSession } from "./store";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("session store", () => {
  it("reads back what was written, and the fallback once removed", () => {
    writeSession("k", { transcript: "a tent", drafts: [1] });
    expect(readSession("k", null)).toEqual({ transcript: "a tent", drafts: [1] });
    writeSession("k", null);
    expect(readSession("k", "none")).toBe("none");
  });

  it("falls back on unreadable JSON", () => {
    sessionStorage.setItem("k", "{oops");
    expect(readSession("k", "none")).toBe("none");
  });

  it("falls back when storage throws", () => {
    const blocked = () => { throw new Error("blocked"); };
    vi.stubGlobal("sessionStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(() => writeSession("k", 1)).not.toThrow();
    expect(readSession("k", "none")).toBe("none");
  });
});
