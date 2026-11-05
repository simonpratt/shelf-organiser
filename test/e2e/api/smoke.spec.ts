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
