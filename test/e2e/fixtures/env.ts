import { tmpdir } from "node:os";
import { join } from "node:path";

/** Set to test a running app or container instead of starting the binary. */
export const target = process.env.APP_TEST_URL;
export const port = 8181;
export const baseURL = target ?? `http://127.0.0.1:${port}`;
export const dataDir = join(tmpdir(), "shelf-organiser-e2e");
export const binary = new URL("../../../bin/shelf-organiser", import.meta.url).pathname;

/** A second server with a login set up, for login.spec.ts (not when testing a running app). */
export const loginPort = 8182;
export const loginBaseURL = `http://127.0.0.1:${loginPort}`;
export const loginDataDir = join(tmpdir(), "shelf-organiser-e2e-login");
export const login = { username: "simon", password: "correct horse battery" };
