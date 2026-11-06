import { createItem, listItems, tagPaths } from "../fixtures/api";
import { expect, test } from "../fixtures/test";

test("renames and moves a tag, then deletes it with its sub-tags while keeping the items", async ({ page, request }) => {
  await createItem(request, { name: "Tent", litres: 30, tags: [["Location", "Shed", "Shelf 2"], ["Type", "Camping"]] });
  await page.goto("/tags");
  // Counts cover the whole subtree, not just items tagged with Location itself.
  await expect(page.getByRole("button", { name: /^Location/ })).toContainText("1 item · 30 L");

  // Rename Shed to Garage and move it to the top level.
  await page.getByRole("button", { name: /^Shed/ }).click();
  const edit = page.getByRole("dialog", { name: "Edit “Location › Shed”" });
  await edit.getByLabel("Name").fill("Garage");
  await edit.getByLabel("Inside").selectOption({ label: "Nothing (top level)" });
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved “Garage”")).toBeVisible();
  expect(await tagPaths(request)).toEqual(["Garage", "Garage/Shelf 2", "Location", "Type", "Type/Camping"]);

  // Delete Garage: the confirmation names the sub-tag it takes with it and the items that lose them.
  await page.getByRole("button", { name: /^Garage/ }).click();
  await page.getByRole("dialog", { name: "Edit “Garage”" }).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete “Garage”?" });
  await expect(confirm).toContainText("also deletes the tag inside it");
  await expect(confirm).toContainText("1 item loses these tags but stays.");
  await confirm.getByRole("button", { name: "Delete tag" }).click();
  await expect(page.getByRole("button", { name: /^Garage/ })).toHaveCount(0);

  expect(await tagPaths(request)).toEqual(["Location", "Type", "Type/Camping"]);
  const [tent] = await listItems(request);
  expect(tent?.tags.map((t) => t.path.join("/"))).toEqual(["Type/Camping"]);
});

test("renaming a tag to a sibling's name merges them after confirming", async ({ page, request }) => {
  await createItem(request, { name: "Vice", litres: 5, tags: [["Location", "Shed", "Workbench"]] });
  await createItem(request, { name: "Saw", litres: 3, tags: [["Location", "Shed", "Left shelf"]] });
  await page.goto("/tags");

  await page.getByRole("button", { name: /^Workbench/ }).click();
  const edit = page.getByRole("dialog", { name: "Edit “Location › Shed › Workbench”" });
  await edit.getByLabel("Name").fill("Left shelf");
  await edit.getByRole("button", { name: "Merge…" }).click();
  const confirm = page.getByRole("dialog", { name: "Merge “Workbench” into “Left shelf”?" });
  await expect(confirm).toContainText("Its 1 item moves to “Location › Shed › Left shelf”");
  await confirm.getByRole("button", { name: "Merge tags" }).click();
  await expect(page.getByText("Merged into “Location › Shed › Left shelf”")).toBeVisible();

  expect(await tagPaths(request)).toEqual(["Location", "Location/Shed", "Location/Shed/Left shelf"]);
  const tags = Object.fromEntries((await listItems(request)).map((i) => [i.name, i.tags.map((t) => t.path.join("/"))]));
  expect(tags).toEqual({ Vice: ["Location/Shed/Left shelf"], Saw: ["Location/Shed/Left shelf"] });
});

test("deleting a nested tag moves its items up to the parent tag", async ({ page, request }) => {
  await createItem(request, { name: "Drill", litres: 10, tags: [["Type", "Tools", "Power tools"]] });
  await page.goto("/tags");
  await page.getByRole("button", { name: /^Power tools/ }).click();
  await page.getByRole("dialog", { name: "Edit “Type › Tools › Power tools”" }).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete “Power tools”?" });
  await expect(confirm).toContainText("1 item moves up to “Tools”.");
  await confirm.getByRole("button", { name: "Delete tag" }).click();
  await expect(page.getByRole("button", { name: /^Power tools/ })).toHaveCount(0);
  const [drill] = await listItems(request);
  expect(drill?.tags.map((t) => t.path.join("/"))).toEqual(["Type/Tools"]);
});
