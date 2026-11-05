// In-page notice for errors and other status, with an optional action
// (e.g. Retry). Errors are announced to screen readers.
import type { ReactNode } from "react";
import { cx } from "../cx";

type Tone = "error" | "info";

export function Banner({ tone = "error", children, action }: { tone?: Tone; children: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === "error" ? "alert" : "status"}
      className={cx("flex items-center justify-between gap-3 rounded-md border px-4 py-3",
        tone === "error" ? "border-error bg-error-tint text-text" : "border-border bg-surface text-text")}>
      <p>{children}</p>
      {action}
    </div>
  );
}
