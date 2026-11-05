// Typed API client, generated from apps/server/openapi/openapi.yaml.
import createClient from "openapi-fetch";
import type { components, paths } from "./schema.gen";

export type Item = components["schemas"]["Item"];
export type ItemInput = components["schemas"]["ItemInput"];
export type Tag = components["schemas"]["Tag"];

export const api = createClient<paths>({ baseUrl: "/" });

/** The message to show for a failed call: the server's {"error"} or a fallback. */
export class ApiError extends Error {}

export function unwrap<T>(res: { data?: T; error?: { error: string } | unknown; response: Response }): T {
  if (res.error !== undefined || !res.response.ok) {
    const msg = (res.error as { error?: string } | undefined)?.error;
    throw new ApiError(msg ?? `Request failed (${res.response.status})`);
  }
  return res.data as T;
}
