// Short-lived status message after an action ("Saved Tent"), with an optional
// action such as Undo. One at a time; a new toast replaces the last. It sits
// above the nav bar and the Add button (or a form's ActionBar), and gets out
// of the way so it never hides what the user does next: it goes as soon as
// they touch anything else or focus a field, and a plain status toast lets
// taps through to what is under it and leaves after a few seconds.
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../cx";
import { Button } from "./Button";

type ToastSpec = { message: string; action?: { label: string; onClick: () => void } };
const ToastContext = createContext<(t: ToastSpec) => void>(() => {});

/** How long a toast with an action stays: long enough to reach for Undo. */
export const TOAST_MS = 8000;
/** How long a plain status toast stays: long enough to read, no longer. */
export const STATUS_TOAST_MS = 3000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastSpec & { key: number }) | null>(null);
  const show = useCallback((t: ToastSpec) => setToast({ ...t, key: Date.now() }), []);
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!toast) return;
    // Only this toast: a newer one may already have replaced it.
    const dismiss = () => setToast((t) => (t?.key === toast.key ? null : t));
    const timer = setTimeout(dismiss, toast.action ? TOAST_MS : STATUS_TOAST_MS);
    const onFocus = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement && e.target.matches("input, textarea, select")) dismiss();
    };
    // Any touch elsewhere (a tap, the start of a scroll, a link to another
    // screen) means the user has moved on. Taps on the toast's own action count.
    const onPointer = (e: PointerEvent) => {
      if (!(e.target instanceof Node && region.current?.contains(e.target) && toast.action)) dismiss();
    };
    document.addEventListener("focusin", onFocus);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [toast]);
  return (
    <ToastContext value={show}>
      {children}
      <div ref={region} role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-36 z-20 flex justify-center px-4">
        {toast && <Toast key={toast.key} message={toast.message} action={toast.action} onDismiss={() => setToast(null)} />}
      </div>
    </ToastContext>
  );
}

export function Toast({ message, action, onDismiss }: ToastSpec & { onDismiss: () => void }) {
  return (
    // Without an action there is nothing to tap, so taps fall through to the screen.
    <div className={cx(action && "pointer-events-auto", "flex w-full max-w-page items-center justify-between gap-3 rounded-md border border-border bg-surface-raised py-1 pl-4 pr-1 shadow-lg")}>
      <p>{message}</p>
      {action && (
        <Button variant="ghost" onClick={() => { action.onClick(); onDismiss(); }}>{action.label}</Button>
      )}
    </div>
  );
}

export function useToast() {
  return use(ToastContext);
}
