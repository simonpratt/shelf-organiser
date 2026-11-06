import type { Locator } from "@playwright/test";
import { createItem } from "../fixtures/api";
import { expect, test } from "../fixtures/test";

/** The breakdown rows, in order, by what a screen reader announces. */
async function expectRows(rows: Locator, names: string[]) {
  await expect(rows).toHaveCount(names.length);
  for (const [i, name] of names.entries()) await expect(rows.nth(i)).toHaveAccessibleName(name);
}

test("maps the space by a dimension down to the items, drills into a tag and climbs back out", async ({ page, request }) => {
  // 300 L: tent 100 (Shelf 2, Camping), chairs 2 × 40 (Shed), lamp 20 (Loft), bike 100 (untagged).
  await createItem(request, { name: "Tent", litres: 100, tags: [["Location", "Shed", "Shelf 2"], ["Type", "Camping"]] });
  await createItem(request, { name: "Camping chairs", litres: 40, quantity: 2, tags: [["Location", "Shed"]] });
  await createItem(request, { name: "Lamp", litres: 20, tags: [["Location", "Loft"]] });
  await createItem(request, { name: "Bike", litres: 100 });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Space" }).click();
  await expect(page.getByText("300 L in 4 items")).toBeVisible();

  // It opens on the first dimension.
  await expect(page.getByLabel("Group by").locator("option:checked")).toHaveText("Location");
  const rows = page.getByRole("list", { name: "Breakdown" }).getByRole("link");
  await expectRows(rows, ["Shed, 180 L, 60%, 2 items", "Untagged, 100 L, 33%, 1 item", "Loft, 20 L, 7%, 1 item"]);

  // The map shows the items inside each block without drilling in; tap the Shed block itself.
  const map = page.getByTestId("space-map");
  await expect(map.getByTitle("Shed: 180 L, 60%")).toContainText("Shed ›180 L · 60%");
  await expect(map.getByText("Tent", { exact: true })).toBeVisible();
  await map.getByTitle("Shed: 180 L, 60%").click();
  await expect(page.getByRole("heading", { name: "Shed" })).toBeVisible();
  await expect(page.getByText("180 L in 2 items · 60% of Location")).toBeVisible();
  await expectRows(rows, ["Shelf 2, 100 L, 56%, 1 item", "Camping chairs, 80 L, 44%"]);

  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Location" }).click();
  await expect(page.getByRole("heading", { name: "Space" })).toBeVisible();
  await expect(rows.first()).toHaveAccessibleName("Shed, 180 L, 60%, 2 items");

  await page.getByLabel("Group by").selectOption({ label: "Type" });
  await expectRows(rows, ["Untagged, 200 L, 67%, 3 items", "Camping, 100 L, 33%, 1 item"]);

  // All items is every item side by side, not grouped.
  await page.getByLabel("Group by").selectOption({ label: "Nothing (all items)" });
  await expectRows(rows, ["Bike, 100 L, 33%", "Tent, 100 L, 33%", "Camping chairs, 80 L, 27%", "Lamp, 20 L, 7%"]);
});
