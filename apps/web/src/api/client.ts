// Typed API client, generated from apps/server/openapi/openapi.yaml.
import createClient from "openapi-fetch";
import type { components, paths } from "./schema.gen";

export type Item = components["schemas"]["Item"];
export type ItemInput = components["schemas"]["ItemInput"];
export type Tag = components["schemas"]["Tag"];
export type Draft = components["schemas"]["Draft"];

/** The message to show for a failed call: the server's {"error"} or a fallback. */
export class ApiError extends Error {}

export const OFFLINE = "Can't reach the server. Check you're on the home network.";

/** fetch, but a network failure (fetch's bare TypeError, "Failed to fetch") becomes a readable ApiError. */
export async function friendlyFetch(input: Request): Promise<Response> {
  try {
    return await fetch(input);
  } catch (e) {
    if (e instanceof TypeError) throw new ApiError(OFFLINE);
    throw e;
  }
}

export const api = createClient<paths>({ baseUrl: "/", fetch: friendlyFetch });

export function unwrap<T>(res: { data?: T; error?: { error: string } | unknown; response: Response }): T {
  if (res.error !== undefined || !res.response.ok) {
    const msg = (res.error as { error?: string } | undefined)?.error;
    throw new ApiError(msg ?? `Request failed (${res.response.status})`);
  }
  return res.data as T;
}
