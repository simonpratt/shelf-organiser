// Seeding and read-back helpers, typed from the generated OpenAPI schema.
import type { APIRequestContext } from "@playwright/test";
import type { components } from "../../../apps/web/src/api/schema.gen";

type Item = components["schemas"]["Item"];
type ItemInput = components["schemas"]["ItemInput"];
type Tag = components["schemas"]["Tag"];

async function json<T>(res: { ok(): boolean; status(): number; text(): Promise<string>; json(): Promise<unknown> }): Promise<T> {
  if (!res.ok()) throw new Error(`${res.status()}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** Empties the database. Against an image without test mode the route 404s, which is fine for @smoke tests. */
export async function resetDatabase(request: APIRequestContext) {
  const res = await request.post("/api/test/reset");
  if (!res.ok() && !(process.env.APP_TEST_URL && res.status() === 404)) {
    throw new Error(`reset failed: ${res.status()}`);
  }
}

export const createItem = async (request: APIRequestContext, data: ItemInput) =>
  json<Item>(await request.post("/api/items", { data }));
export const listItems = async (request: APIRequestContext) => json<Item[]>(await request.get("/api/items"));
export const ensureTag = async (request: APIRequestContext, path: string[]) =>
  json<Tag>(await request.post("/api/tags", { data: { path } }));
export const listTags = async (request: APIRequestContext) => json<Tag[]>(await request.get("/api/tags"));
export const tagPaths = async (request: APIRequestContext) => (await listTags(request)).map((t) => t.path.join("/"));
