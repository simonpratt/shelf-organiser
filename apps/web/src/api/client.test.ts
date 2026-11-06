import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, friendlyFetch, OFFLINE, setUnauthorizedHandler } from "./client";

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

describe("a 401", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedHandler(() => {});
  });

  it("opens the login page when the session has gone, but not for a wrong password", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(Response.json({ error: "unauthorized" }, { status: 401 })));
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    await api.POST("/api/login", { body: { username: "simon", password: "wrong" } });
    expect(onUnauthorized).not.toHaveBeenCalled();
    await api.GET("/api/items");
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
});
