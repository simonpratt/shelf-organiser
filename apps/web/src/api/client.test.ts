import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, friendlyFetch, OFFLINE } from "./client";

describe("friendlyFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("says the server can't be reached instead of the browser's Failed to fetch", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    await expect(friendlyFetch(new Request("http://x/api/items"))).rejects.toEqual(new ApiError(OFFLINE));
  });

  it("passes other failures through", async () => {
    const abort = new DOMException("aborted", "AbortError");
    vi.stubGlobal("fetch", () => Promise.reject(abort));
    await expect(friendlyFetch(new Request("http://x/api/items"))).rejects.toBe(abort);
  });
});
