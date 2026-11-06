import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { STATUS_TOAST_MS, ToastProvider, useToast } from "./Toast";

function Harness({ undo }: { undo?: () => void }) {
  const toast = useToast();
  return (
    <>
      <button onClick={() => toast({ message: "Saved Tent", action: undo && { label: "Undo", onClick: undo } })}>Save</button>
      <button>Something else</button>
    </>
  );
}

it("lets taps through a status toast and goes as soon as the user touches anything", async () => {
  const user = userEvent.setup();
  render(<ToastProvider><Harness /></ToastProvider>);
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByText("Saved Tent").closest("div")).not.toHaveClass("pointer-events-auto");
  await user.click(screen.getByRole("button", { name: "Something else" }));
  expect(screen.queryByText("Saved Tent")).toBeNull();
});

it("leaves a status toast after a few seconds", () => {
  vi.useFakeTimers();
  try {
    render(<ToastProvider><Harness /></ToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Saved Tent")).toBeTruthy();
    act(() => vi.advanceTimersByTime(STATUS_TOAST_MS));
    expect(screen.queryByText("Saved Tent")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it("keeps an Undo toast tappable, and goes on a touch elsewhere", async () => {
  const user = userEvent.setup();
  const undo = vi.fn();
  render(<ToastProvider><Harness undo={undo} /></ToastProvider>);
  await user.click(screen.getByRole("button", { name: "Save" }));
  await user.click(screen.getByRole("button", { name: "Undo" }));
  expect(undo).toHaveBeenCalledOnce();

  await user.click(screen.getByRole("button", { name: "Save" }));
  await user.click(screen.getByRole("button", { name: "Something else" }));
  expect(screen.queryByText("Saved Tent")).toBeNull();
});

it("stays when a new screen focuses its first field, and goes once the user types", async () => {
  const user = userEvent.setup();
  render(<ToastProvider><Harness /><input aria-label="Name" /></ToastProvider>);
  await user.click(screen.getByRole("button", { name: "Save" }));
  act(() => screen.getByLabelText("Name").focus());
  expect(screen.getByText("Saved Tent")).toBeTruthy();
  await user.keyboard("T");
  expect(screen.queryByText("Saved Tent")).toBeNull();
});
