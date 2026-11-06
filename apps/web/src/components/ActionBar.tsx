// Sticky bar of form actions at the bottom of a form screen, so Save is
// always in reach without scrolling. notice (a failed save's Banner) sits
// just above the buttons, so the error is in view wherever the screen is
// scrolled to.
import type { ReactNode } from "react";

export function ActionBar({ children, notice }: { children: ReactNode; notice?: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-2 flex flex-col gap-3 border-t border-border bg-bg px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {notice}
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
