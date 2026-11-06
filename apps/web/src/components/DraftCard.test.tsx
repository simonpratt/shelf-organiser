import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";
import { emptyForm, type ItemForm } from "../items/form";
import { DraftCard } from "./DraftCard";

// Holds the draft the way the review screen does: onChange may be called
// more than once in one event, and each call must build on the last.
function Harness() {
  const [form, setForm] = useState<ItemForm>({ ...emptyForm(), name: "Tent", litres: "60" });
  return (
    <DraftCard form={form} onChange={setForm} onRemove={() => {}} errors={{}} defaultOpen
      existingTags={[["Location", "Shed", "Top shelf"]]} />
  );
}

it("adds a tag picked from the suggestions to a draft and clears the field", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const field = screen.getByRole("combobox", { name: "Tags" });
  await user.type(field, "top");
  await user.click(screen.getByRole("option", { name: "Location › Shed › Top shelf" }));
  expect(screen.getByRole("list", { name: "Chosen tags" })).toHaveTextContent("Top shelf");
  expect(field).toHaveValue("");
});

it("adds a typed new tag path to a draft on Enter", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.type(screen.getByRole("combobox", { name: "Tags" }), "Location/Loft{Enter}");
  expect(screen.getByRole("list", { name: "Chosen tags" })).toHaveTextContent("Loft");
});
