import { ensureTag, listItems } from "../fixtures/api";
import { expect, test } from "../fixtures/test";

// The server's test-mode fake of the Anthropic API makes one draft per
// comma- or "and"-separated piece, 40 L each, tagging a piece that mentions
// an existing tag's name.
test("dictates a list, corrects the drafts and saves them all", async ({ page, request }) => {
  await ensureTag(request, ["Location", "Shed"]);
  await ensureTag(request, ["Type", "Camping"]);
  await page.goto("/items/new");

  await page.getByRole("link", { name: "Dictate items" }).click();
  await page.getByLabel("What's here?").fill("two camping chairs, a drill in the shed and a lamp");
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

  await page.getByRole("button", { name: "Save all 2 items" }).click();
  await expect(page.getByText("Saved 2 items")).toBeVisible();
  await expect(page.getByRole("list", { name: "Items" }).getByRole("listitem")).toHaveCount(2);

  const saved = (await listItems(request)).map((i) => [i.name, i.litres, i.quantity, i.tags.map((t) => t.path.join("/"))]);
  expect(saved).toEqual([
    ["Camping chairs", 40, 2, ["Type/Camping"]],
    ["Drill", 10, 1, ["Location/Shed"]],
  ]);
});
