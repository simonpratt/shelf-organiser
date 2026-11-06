import { ensureTag, listItems } from "../fixtures/api";
import { expect, test } from "../fixtures/test";

// The server's test-mode fake of the Anthropic API makes one draft per
// comma- or "and"-separated piece, 40 L unless a keyword gives a rough size
// (bike 500 L, toolbox 20 L, ...), tagging a piece that mentions an existing
// tag's name. The fixture's fake transcriber "hears" window.shelfFakeSaid.
test("speaks a list, fixes a word, corrects the drafts and saves them all", async ({ page, request }) => {
  await ensureTag(request, ["Location", "Shed"]);
  await ensureTag(request, ["Type", "Camping"]);
  await page.goto("/items/new");

  await page.getByRole("link", { name: "Dictate items" }).click();
  await expect(page.getByRole("progressbar", { name: "Getting speech recognition ready" })).toHaveAttribute("aria-valuenow", "49");
  await page.evaluate(() => (window.shelfFakeSaid = "two camping chairs, a drill in the shed and a lamb"));
  const speak = page.getByRole("button", { name: "Speak" });
  await speak.click();
  await expect(speak).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Listening. Tap when you're done")).toBeVisible();
  await speak.click();
  const box = page.getByLabel("What's here?");
  await expect(box).toHaveValue("two camping chairs, a drill in the shed and a lamb");
  await expect(page.getByRole("progressbar")).toBeHidden();
  await box.fill("two camping chairs, a drill in the shed and a lamp");
  await page.getByRole("button", { name: "Make drafts" }).click();

  await expect(page.getByRole("heading", { name: "Check the drafts" })).toBeVisible();
  const chairs = page.getByRole("article", { name: "Camping chairs" });
  await expect(chairs).toContainText("2 × Crate (40 L)");
  await expect(chairs).toContainText("Type › Camping");
  await expect(page.getByRole("article", { name: "Drill in the shed" })).toContainText("Location › Shed");

  // Drop the lamp, and fix the drill's name and size.
  await page.getByRole("button", { name: "Remove Lamp" }).click();
  const drill = page.getByRole("article", { name: "Drill in the shed" });
  await drill.getByRole("button", { name: "Edit" }).click();
  await drill.getByLabel("Name").fill("Drill");
  await page.getByRole("article", { name: "Drill" }).getByRole("radio", { name: /Shoebox/ }).click();
  await page.getByRole("article", { name: "Drill" }).getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("article", { name: "Drill" })).toContainText("Shoebox (10 L)");

  // Going back and returning keeps the corrected drafts.
  await page.getByRole("button", { name: "Back to adding an item" }).click();
  await page.getByRole("link", { name: "Dictate items" }).click();
  await expect(page.getByRole("article", { name: "Drill" })).toContainText("Shoebox (10 L)");

  await page.getByRole("button", { name: "Save all 2 items" }).click();
  await expect(page.getByText("Saved 2 items. Add the next one.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add item" })).toBeVisible();

  const saved = (await listItems(request)).map((i) => [i.name, i.litres, i.quantity, i.tags.map((t) => t.path.join("/"))]);
  expect(saved).toEqual([
    ["Camping chairs", 40, 2, ["Type/Camping"]],
    ["Drill", 10, 1, ["Location/Shed"]],
  ]);
});

test("starts a dictation with the Add form's location and puts it on every draft", async ({ page, request }) => {
  await ensureTag(request, ["Type", "Camping"]);
  await page.goto("/items/new");
  await page.getByLabel("Name").fill("Tent");
  await page.getByRole("radio", { name: /Crate/ }).click();
  await page.getByRole("combobox", { name: "Tags" }).fill("Location/Shed/Shelf 3");
  await page.getByRole("combobox", { name: "Tags" }).press("Enter");
  await page.getByRole("button", { name: "Save and add another" }).click();
  await expect(page.getByText("Saved “Tent”")).toBeVisible();

  await page.getByRole("link", { name: "Dictate items" }).click();
  const shared = page.getByRole("list", { name: "Chosen tags for every item" });
  await expect(shared).toHaveText("Location › Shed › Shelf 3");
  await page.getByLabel("What's here?").fill("camping chairs and a lamp");
  await page.getByRole("button", { name: "Make drafts" }).click();
  await expect(page.getByRole("heading", { name: "Check the drafts" })).toBeVisible();
  await expect(shared).toHaveText("Location › Shed › Shelf 3");
  await page.getByRole("button", { name: "Save all 2 items" }).click();
  // Back on the Add form, still on the same shelf, as after Save and add another.
  await expect(page.getByRole("heading", { name: "Add item" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Chosen tags" })).toHaveText("Location › Shed › Shelf 3");

  const saved = Object.fromEntries((await listItems(request)).map((i) => [i.name, i.tags.map((t) => t.path.join("/"))]));
  expect(saved).toEqual({
    Tent: ["Location/Shed/Shelf 3"],
    "Camping chairs": ["Location/Shed/Shelf 3", "Type/Camping"],
    Lamp: ["Location/Shed/Shelf 3"],
  });
});

test("on a fresh install, carries the location set on the Add form through a dictation and back", async ({ page, request }) => {
  // No tags at all yet, so there is no Location dimension until this save starts one.
  await page.goto("/items/new");
  await page.getByRole("combobox", { name: "Tags" }).fill("Location/Shed/Shelf 1");
  await page.getByRole("combobox", { name: "Tags" }).press("Enter");

  await page.getByRole("link", { name: "Dictate items" }).click();
  const shared = page.getByRole("list", { name: "Chosen tags for every item" });
  await expect(shared).toContainText("Location › Shed › Shelf 1");
  await page.getByLabel("What's here?").fill("lawn mower, two camping chairs");
  await page.getByRole("button", { name: "Make drafts" }).click();
  await page.getByRole("button", { name: "Save all 2 items" }).click();
  await expect(page.getByRole("heading", { name: "Add item" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Chosen tags" })).toHaveText("Location › Shed › Shelf 1");

  const saved = (await listItems(request)).map((i) => [i.name, i.tags.map((t) => t.path.join("/"))]);
  expect(saved).toEqual([
    ["Lawn mower", ["Location/Shed/Shelf 1"]],
    ["Camping chairs", ["Location/Shed/Shelf 1"]],
  ]);
});

test("falls back to typing when the microphone is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  });
  await page.goto("/items/dictate");
  await page.getByRole("button", { name: "Speak" }).click();
  await expect(page.getByText("The microphone is blocked for this site.")).toBeVisible();
  await page.getByLabel("What's here?").fill("a lamp");
  await page.getByRole("button", { name: "Make drafts" }).click();
  await expect(page.getByRole("article", { name: "Lamp" })).toBeVisible();
});

test("says plainly when speech recognition can't download, and offers Retry and typing", async ({ page }) => {
  await page.addInitScript(() => {
    window.shelfFakeTranscriber = {
      load: () => Promise.reject(new Error("local_files_only=true and file was not found locally: config.json")),
      transcribe: () => Promise.resolve(""),
    };
  });
  await page.goto("/items/dictate");
  await expect(page.getByText("Couldn't download speech recognition. Check you're on home Wi-Fi")).toBeVisible();
  await expect(page.getByText("config.json")).toBeHidden();
  await expect(page.getByRole("button", { name: "Speak" })).toBeDisabled();
  await expect(page.getByText("Speaking isn't available until speech recognition downloads")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});
