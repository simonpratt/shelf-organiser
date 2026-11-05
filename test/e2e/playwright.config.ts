import { defineConfig, devices } from "@playwright/test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { baseURL, binary, dataDir, port, target } from "./fixtures/env";

// Fail fast when the binary is older than the source it embeds, so a
// forgotten `make build` can't pass against stale code. `make e2e` builds first.
function assertFreshBinary() {
  let built: number;
  try {
    built = statSync(binary).mtimeMs;
  } catch {
    throw new Error(`${binary} is missing: run make build (or make e2e)`);
  }
  const root = new URL("../../apps/", import.meta.url).pathname;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", "dist"].includes(entry.name)) continue;
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (statSync(p).mtimeMs > built) throw new Error(`${p} is newer than ${binary}: run make build (or make e2e)`);
    }
  };
  walk(root);
}
if (!target) assertFreshBinary();

export default defineConfig({
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // One server and one database, reset before each test.
  workers: 1,
  fullyParallel: false,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "api", testDir: "./api" },
    // Phone first: the app is used on a phone in the shed.
    { name: "ui", testDir: "./ui", use: { ...devices["Pixel 7"] } },
  ],
  webServer: target
    ? undefined
    : {
        command: `rm -rf '${dataDir}' && '${binary}'`,
        url: `http://127.0.0.1:${port}/healthz`,
        env: {
          APP_TEST_MODE: "1",
          DATA_DIR: dataDir,
          PORT: String(port),
          // Dictation talks to the server's own test-mode fake of the Anthropic API.
          ANTHROPIC_API_KEY: "test-anthropic-key",
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}/api/test/anthropic/`,
        },
        reuseExistingServer: false,
        gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
      },
});
