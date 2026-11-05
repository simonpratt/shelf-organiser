import { createItem, listItems, tagPaths } from "../fixtures/api";
import { expect, test } from "../fixtures/test";

test("renames and moves a tag, then deletes it with its sub-tags while keeping the items", async ({ page, request }) => {
  await createItem(request, { name: "Tent", litres: 30, tags: [["Location", "Shed", "Shelf 2"], ["Type", "Camping"]] });
  await page.goto("/tags");

  // Rename Shed to Garage and move it to the top level.
  await page.getByRole("button", { name: /^Shed/ }).click();
  const edit = page.getByRole("dialog", { name: "Edit “Location › Shed”" });
  await edit.getByLabel("Name").fill("Garage");
  await edit.getByLabel("Inside").selectOption({ label: "Nothing (top level)" });
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved “Garage”")).toBeVisible();
  expect(await tagPaths(request)).toEqual(["Garage", "Garage/Shelf 2", "Location", "Type", "Type/Camping"]);

  // Delete Garage: the confirmation names the sub-tag it takes with it.
  await page.getByRole("button", { name: /^Garage/ }).click();
  await page.getByRole("dialog", { name: "Edit “Garage”" }).getByRole("button", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete “Garage”?" });
  await expect(confirm).toContainText("also deletes the tag inside it");
  await confirm.getByRole("button", { name: "Delete tag" }).click();
  await expect(page.getByRole("button", { name: /^Garage/ })).toHaveCount(0);

  expect(await tagPaths(request)).toEqual(["Location", "Type", "Type/Camping"]);
  const [tent] = await listItems(request);
  expect(tent?.tags.map((t) => t.path.join("/"))).toEqual(["Type/Camping"]);
});
