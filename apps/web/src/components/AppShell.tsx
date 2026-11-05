// Page frame: a centred phone-width column, with the bottom nav on the main
// screens. Form screens drop the nav and use an ActionBar instead.
import type { ReactNode } from "react";
import { cx } from "../cx";
import { BottomNav } from "./BottomNav";

export function AppShell({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  return (
    <>
      <main className={cx("mx-auto flex min-h-dvh max-w-page flex-col gap-4 px-4 pt-4", nav ? "pb-40" : "pb-0")}>
        {children}
      </main>
      {nav && <BottomNav />}
    </>
  );
}
