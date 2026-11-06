import { readFileSync } from "node:fs";
import { createItem, listItems } from "../fixtures/api";
import { expect, test } from "../fixtures/test";

test("answers the health check and serves the app shell with its assets @smoke", async ({ request }) => {
  expect((await request.get("/healthz")).ok()).toBe(true);
  const page = await request.get("/");
  expect(page.headers()["cache-control"]).toBe("no-cache");
  const html = await page.text();
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  expect(script, "index.html references a hashed script").toBeTruthy();
  const asset = await request.get(script!);
  expect(asset.ok()).toBe(true);
  expect(asset.headers()["cache-control"]).toContain("immutable");
  // Cross-origin isolated, so the speech worker's WASM gets threads.
  expect(page.headers()["cross-origin-embedder-policy"]).toBe("require-corp");
  expect(page.headers()["cross-origin-opener-policy"]).toBe("same-origin");
});

test("serves the speech model from the app, cached for good, and 404s a file it hasn't got @smoke", async ({ request }) => {
  const model = JSON.parse(readFileSync(new URL("../../../apps/web/speech-model.json", import.meta.url), "utf8")) as {
    dir: string;
    files: Record<string, string>;
  };
  for (const file of Object.keys(model.files)) {
    const res = await request.head(`/models/${model.dir}/${file}`);
    expect(res.status(), file).toBe(200);
    expect(res.headers()["cache-control"]).toContain("immutable");
  }
  // Not the app shell, which would look like a file to the model loader.
  expect((await request.get(`/models/${model.dir}/missing.json`)).status()).toBe(404);
});

test("saves an item to the data directory and deletes it again @smoke", async ({ request }) => {
  const item = await createItem(request, { name: "Smoke test box", litres: 1, tags: [["Smoke test"]] });
  expect((await listItems(request)).map((i) => i.id)).toContain(item.id);
  expect((await request.delete(`/api/items/${item.id}`)).status()).toBe(204);
  const tags = (await (await request.get("/api/tags")).json()) as { id: number; path: string[] }[];
  const smokeTag = tags.find((t) => t.path.join("/") === "Smoke test");
  if (smokeTag) await request.delete(`/api/tags/${smokeTag.id}`);
});

test("keeps client routes on the app shell but 404s unknown API paths", async ({ request }) => {
  const page = await request.get("/items/new");
  expect(page.status()).toBe(200);
  expect(await page.text()).toContain('<div id="root">');
  const api = await request.get("/api/nope");
  expect(api.status()).toBe(404);
  expect(await api.json()).toEqual({ error: "not found" });
});
