import { ensureTag, listItems, tagPaths } from "../fixtures/api";
import { expect, test } from "../fixtures/test";

test("adds an item with a new nested tag, edits it, then deletes it and undoes the delete", async ({ page, request }) => {
  await ensureTag(request, ["Type", "Camping"]);
  await page.goto("/");

  // Add, creating Location › Shed › Shelf 2 inline.
  await page.getByRole("link", { name: "Add your first item" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Give the item a name")).toBeVisible();
  await page.getByLabel("Name").fill("Camping chairs");
  await expect(page.getByText("Give the item a name")).toBeHidden();
  await page.getByRole("radio", { name: /Crate/ }).click();
  await page.getByRole("button", { name: "One more" }).click();
  await page.getByRole("combobox", { name: "Tags" }).fill("Location/Shed/Shelf 2");
  await expect(page.getByRole("option", { name: "Create “Location › Shed › Shelf 2”" })).toBeVisible();
  await page.getByRole("combobox", { name: "Tags" }).press("Enter");
  await expect(page.getByRole("list", { name: "Chosen tags" })).toContainText("Location › Shed › Shelf 2");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const row = page.getByRole("list", { name: "Items" }).getByRole("listitem").filter({ hasText: "Camping chairs" });
  await expect(row).toContainText("80 L");
  await expect(row).toContainText("2 × 40 L");
  await expect(page.getByText("1 item · 80 L")).toBeVisible();
  expect(await tagPaths(request)).toEqual(
    expect.arrayContaining(["Location", "Location/Shed", "Location/Shed/Shelf 2"]),
  );

  // Edit: type litres directly and add an existing tag from the suggestions.
  await row.click();
  await expect(page.getByRole("heading", { name: "Edit item" })).toBeVisible();
  await page.getByLabel("Name").fill("Folding chairs");
  await page.getByLabel("Or litres").fill("35");
  await page.getByRole("combobox", { name: "Tags" }).fill("camp");
  await page.getByRole("option", { name: "Type › Camping", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const edited = page.getByRole("listitem").filter({ hasText: "Folding chairs" });
  await expect(edited).toContainText("70 L");
  await expect(edited).toContainText("Type › Camping");
  const [saved] = await listItems(request);
  expect(saved?.tags.map((t) => t.path.join("/")).sort()).toEqual(["Location/Shed/Shelf 2", "Type/Camping"]);

  // Delete, then undo.
  await edited.click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Deleted “Folding chairs”")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Restored “Folding chairs”")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Folding chairs" })).toContainText("70 L");
  const restored = await listItems(request);
  expect(restored.map((i) => [i.name, i.litres, i.quantity, i.tags.length])).toEqual([["Folding chairs", 35, 2, 2]]);
});

test("loads the item list @smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Items" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});
