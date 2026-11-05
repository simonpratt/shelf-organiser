// Every spec imports test from here, so each test starts from an empty database.
import { test as base } from "@playwright/test";
import { resetDatabase } from "./api";

export const test = base.extend<{ resetDatabase: void }>({
  resetDatabase: [
    async ({ request }, use) => {
      await resetDatabase(request);
      await use();
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
