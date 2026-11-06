// Every spec imports test from here, so each test starts from an empty
// database, and every page gets a fake speech transcriber unless a test opts
// out with test.use({ fakeSpeech: false }) (only the slow speech project does).
import { test as base } from "@playwright/test";
import { resetDatabase } from "./api";

declare global {
  interface Window {
    /** What the fake transcriber hears; set it with page.evaluate before speaking. */
    shelfFakeSaid?: string;
    /** The app's test seam, as declared in apps/web/src/speech/transcriber.ts. */
    shelfFakeTranscriber?: {
      load(onProgress: (loaded: number, total: number) => void): Promise<void>;
      transcribe(audio: Float32Array): Promise<string>;
    };
  }
}

/**
 * Stands in for Whisper (apps/web/src/speech/transcriber.ts): reports half a
 * download until the test sets window.shelfFakeSaid, then returns that for any
 * real recorded audio.
 */
function fakeTranscriber() {
  window.shelfFakeTranscriber = {
    async load(onProgress) {
      onProgress(38_000_000, 77_000_000);
      while (window.shelfFakeSaid === undefined) await new Promise((resolve) => setTimeout(resolve, 50));
    },
    async transcribe(audio) {
      if (audio.length === 0) throw new Error("the fake transcriber got no audio");
      return window.shelfFakeSaid ?? "";
    },
  };
}

export const test = base.extend<{ resetDatabase: void; fakeSpeech: boolean }>({
  fakeSpeech: [true, { option: true }],
  resetDatabase: [
    async ({ request }, use) => {
      await resetDatabase(request);
      await use();
    },
    { auto: true },
  ],
  page: async ({ page, fakeSpeech }, use) => {
    if (fakeSpeech) await page.addInitScript(fakeTranscriber);
    await use(page);
  },
});

export { expect } from "@playwright/test";
