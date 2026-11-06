import { expect, it } from "vitest";
import catalogue from "./ComponentsPage.tsx?raw";

const files = Object.keys(import.meta.glob(["../components/*.tsx", "!../components/*.test.tsx"]));

it("shows every shared component on the catalogue page", () => {
  expect(files.length).toBeGreaterThan(0);
  const missing = files
    .map((f) => f.replace("../components/", "").replace(".tsx", ""))
    .filter((name) => !catalogue.includes(`from "../components/${name}"`));
  expect(missing).toEqual([]);
});
