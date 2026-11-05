import { tmpdir } from "node:os";
import { join } from "node:path";

/** Set to test a running app or container instead of starting the binary. */
export const target = process.env.APP_TEST_URL;
export const port = 8181;
export const baseURL = target ?? `http://127.0.0.1:${port}`;
export const dataDir = join(tmpdir(), "shelf-organiser-e2e");
export const binary = new URL("../../../bin/shelf-organiser", import.meta.url).pathname;
