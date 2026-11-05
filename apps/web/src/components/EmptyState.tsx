// What a view shows when it has nothing to list, with the next step to take.
import type { ReactNode } from "react";

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <h2 className="text-lg font-medium">{title}</h2>
      {children && <p className="text-muted">{children}</p>}
      {action}
    </div>
  );
}
