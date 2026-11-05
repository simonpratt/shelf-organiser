// Floating primary action (Add item), above the bottom nav.
import type { ReactNode } from "react";
import { Button } from "./Button";

export function Fab({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-10 mx-auto flex max-w-page justify-end px-4">
      <Button to={to} variant="primary" icon={icon} className="pointer-events-auto rounded-full shadow-lg">
        {label}
      </Button>
    </div>
  );
}
