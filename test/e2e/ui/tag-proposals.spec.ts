import { createItem, ensureTag, listItems } from "../fixtures/api";
import { expect, test } from "../fixtures/test";

// The server's test-mode fake of the Anthropic API proposes tags in the Type
// dimension from a keyword table (mower: Garden, drill: Tools › Power tools,
// couch: Furniture), preferring an existing Type tag named in the item, and
// leaves items matching nothing without a proposal.

const tagsOf = async (request: Parameters<typeof listItems>[0]) =>
  Object.fromEntries((await listItems(request)).map((i) => [i.name, i.tags.map((t) => t.path.join("/"))]));

test("organises untyped items: edits one proposal, leaves one out and applies the rest", async ({ page, request }) => {
  await ensureTag(request, ["Type", "Camping"]);
  await createItem(request, { name: "Lawn mower", litres: 300, tags: [["Location", "Shed"]] });
  await createItem(request, { name: "Old couch", litres: 900 });
  await createItem(request, { name: "Camping stove", litres: 20 });
  await createItem(request, { name: "Cordless drill", litres: 10 });
  await createItem(request, { name: "Mystery box", litres: 40 });
  await page.goto("/");

  await page.getByRole("link", { name: "Organise" }).click();
  await page.getByRole("button", { name: "Propose tags" }).click();
  await expect(page.getByRole("heading", { name: "Check the proposals" })).toBeVisible();

  await expect(page.getByRole("article", { name: "Lawn mower" })).toContainText("Type › GardenNew");
  await expect(page.getByRole("article", { name: "Camping stove" })).toContainText("Type › Camping");
  await expect(page.getByRole("article", { name: "Camping stove" })).not.toContainText("New");
  await expect(page.getByText("1 more item has no Type tag yet")).toBeVisible();

  await page.getByRole("button", { name: "Leave out Old couch" }).click();
  const drill = page.getByRole("article", { name: "Cordless drill" });
  await drill.getByRole("button", { name: "Edit" }).click();
  await drill.getByRole("button", { name: "Remove tag Type › Tools › Power tools" }).click();
  await drill.getByLabel("Tags to add").fill("Type/Tools");
  await drill.getByRole("button", { name: "Done" }).click();
  await expect(drill).toContainText("Type › ToolsNew");

  // Nothing has changed until Apply.
  expect((await tagsOf(request))["Lawn mower"]).toEqual(["Location/Shed"]);
  await page.getByRole("button", { name: "Apply to 3 items" }).click();
  await expect(page.getByText("Tagged 3 items")).toBeVisible();

  expect(await tagsOf(request)).toEqual({
    "Old couch": [],
    "Lawn mower": ["Location/Shed", "Type/Garden"],
    "Mystery box": [],
    "Camping stove": ["Type/Camping"],
    "Cordless drill": ["Type/Tools"],
  });
});

test("suggests tags on the item form and adds only the one tapped", async ({ page, request }) => {
  await ensureTag(request, ["Type", "Camping"]);
  await page.goto("/items/new");

  await page.getByRole("button", { name: "Suggest tags" }).click();
  await expect(page.getByText("Name the item first")).toBeVisible();

  await page.getByLabel("Name").fill("Camping chair");
  await page.getByRole("radio", { name: /Crate/ }).click();
  await page.getByRole("button", { name: "Suggest tags" }).click();
  const suggested = page.getByRole("list", { name: "Suggested tags" });
  await expect(suggested.getByRole("button")).toHaveText(["Type › Camping", "Type › FurnitureNew"]);

  await suggested.getByRole("button", { name: "Add tag Type › Furniture (new)" }).click();
  await expect(page.getByRole("list", { name: "Chosen tags" })).toContainText("Type › FurnitureNew");
  await expect(suggested.getByRole("button")).toHaveText(["Type › Camping"]);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved “Camping chair”")).toBeVisible();
  expect(await tagsOf(request)).toEqual({ "Camping chair": ["Type/Furniture"] });
});
