// Against the second server in playwright.config.ts, the one with a login set up.
import { createItem } from "../fixtures/api";
import { login, loginBaseURL, target } from "../fixtures/env";
import { expect, test } from "../fixtures/test";

test.skip(!!target, "needs the e2e suite's own server with a login set up");
test.use({ baseURL: loginBaseURL });

test("logs in, returns to the screen that needed it, stays logged in on reload, and logs out", async ({ page, request }) => {
  expect((await request.post("/api/login", { data: login })).status()).toBe(204);
  await createItem(request, { name: "Tent", litres: 30, tags: [["Location", "Shed"]] });

  await page.goto("/tags");
  await expect(page).toHaveURL("/login?next=%2Ftags");
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await expect(page.getByLabel("Username")).toHaveAttribute("autocomplete", "username");
  await expect(page.getByLabel("Password")).toHaveAttribute("autocomplete", "current-password");

  await page.getByLabel("Username").fill(login.username);
  await page.getByLabel("Password").fill("not it");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Wrong username or password.");
  await expect(page.getByLabel("Password")).toHaveValue("");

  await page.getByLabel("Password").fill(login.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/tags");
  await expect(page.getByRole("button", { name: /^Location/ })).toContainText("1 item · 30 L");

  const [cookie] = await page.context().cookies();
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Strict" });
  expect(cookie!.expires * 1000 - Date.now()).toBeGreaterThan(89 * 24 * 3600 * 1000);

  await page.reload();
  await expect(page.getByRole("button", { name: /^Location/ })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL("/login");
  await page.goto("/");
  await expect(page).toHaveURL("/login");
});
