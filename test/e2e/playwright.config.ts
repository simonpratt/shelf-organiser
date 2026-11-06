import { defineConfig, devices } from "@playwright/test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { baseURL, binary, dataDir, login, loginDataDir, loginPort, port, target } from "./fixtures/env";

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

const fakeMic = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
// espeak-ng reading a dictation (9 s, 16 kHz mono); the words are in speech/dictation.spec.ts.
const speechClip = new URL("./speech/shed.wav", import.meta.url).pathname;

export default defineConfig({
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // One server and one database, reset before each test.
  workers: 1,
  fullyParallel: false,
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "api", testDir: "./api" },
    // Phone first: the app is used on a phone in the shed. Chromium's fake
    // microphone (a beep) lets Dictate record; the fixture fakes the transcriber.
    { name: "ui", testDir: "./ui", use: { ...devices["Pixel 7"], launchOptions: { args: fakeMic } } },
    // The real Whisper model on a committed clip: slow, so only `make e2e-speech` runs it.
    {
      name: "speech",
      testDir: "./speech",
      use: { ...devices["Pixel 7"], launchOptions: { args: [...fakeMic, `--use-file-for-fake-audio-capture=${speechClip}`] } },
    },
  ],
  webServer: target
    ? undefined
    : [
        {
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
        // The same binary with a login set up, for ui/login.spec.ts; every other spec uses the one above, with none.
        {
          command: `rm -rf '${loginDataDir}' && '${binary}'`,
          url: `http://127.0.0.1:${loginPort}/healthz`,
          env: {
            APP_TEST_MODE: "1",
            DATA_DIR: loginDataDir,
            PORT: String(loginPort),
            APP_USERNAME: login.username,
            APP_PASSWORD: login.password,
          },
          reuseExistingServer: false,
          gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
        },
      ],
});
