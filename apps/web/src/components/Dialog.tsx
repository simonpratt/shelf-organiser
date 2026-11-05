// Modal on the native <dialog> with showModal(), so focus trapping and Escape
// come from the browser. `open` is the only source of truth: Escape asks the
// owner to close rather than closing the element itself.
import { useEffect, useId, useRef, type ReactNode } from "react";

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      className="m-auto w-[min(100vw-2rem,28rem)] rounded-lg border border-border bg-surface p-0 text-text">
      {open && (
        <div className="flex flex-col gap-4 p-5">
          <h2 id={titleId} className="text-lg font-medium">{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}
