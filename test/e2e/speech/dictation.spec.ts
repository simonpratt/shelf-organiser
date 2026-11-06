import { expect, test } from "../fixtures/test";

// The real Whisper model in the browser, hearing shed.wav through Chromium's
// fake microphone: "Two camping chairs, a crate of Christmas lights, the old
// tent, a red toolbox and three paint tins, all on shelf two in the shed."
// Slow (the model is 77 MB), so it runs only from `make e2e-speech`.
test.use({ fakeSpeech: false });

test("writes down a spoken dictation with the real model", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/items/dictate");
  // The first visit downloads the model, showing how far it has got.
  await expect(page.getByRole("progressbar", { name: "Getting speech recognition ready" })).toBeVisible();
  await expect(page.getByRole("progressbar")).toBeHidden({ timeout: 120_000 });

  const speak = page.getByRole("button", { name: "Speak" });
  await speak.click();
  await expect(speak).toHaveAttribute("aria-pressed", "true");
  // Chromium plays the clip from the start once the microphone opens.
  await page.waitForTimeout(9_500);
  await speak.click();
  const box = page.getByLabel("What's here?");
  await expect(box).not.toHaveValue("", { timeout: 60_000 });
  const heard = (await box.inputValue()).toLowerCase();
  for (const words of ["camping chairs", "christmas lights", "tent", "shelf two", "shed"]) expect(heard).toContain(words);
});
