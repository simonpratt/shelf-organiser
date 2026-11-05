// Short-lived status message after an action ("Saved Tent"), with an optional
// action such as Undo. One at a time; a new toast replaces the last. It sits
// above the nav bar or a form's ActionBar, and gets out of the way as soon as
// the user focuses a field, so it never hides what they are typing into.
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "./Button";

type ToastSpec = { message: string; action?: { label: string; onClick: () => void } };
const ToastContext = createContext<(t: ToastSpec) => void>(() => {});

/** How long a toast with an action stays: long enough to reach for Undo. */
export const TOAST_MS = 8000;
/** How long a plain status toast stays. */
export const STATUS_TOAST_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastSpec & { key: number }) | null>(null);
  const show = useCallback((t: ToastSpec) => setToast({ ...t, key: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.action ? TOAST_MS : STATUS_TOAST_MS);
    const onFocus = (e: FocusEvent) => {
      // Only this toast: a newer one may already have replaced it.
      if (e.target instanceof HTMLElement && e.target.matches("input, textarea, select")) {
        setToast((t) => (t?.key === toast.key ? null : t));
      }
    };
    document.addEventListener("focusin", onFocus);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("focusin", onFocus);
    };
  }, [toast]);
  return (
    <ToastContext value={show}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-20 flex justify-center px-4">
        {toast && <Toast key={toast.key} message={toast.message} action={toast.action} onDismiss={() => setToast(null)} />}
      </div>
    </ToastContext>
  );
}

export function Toast({ message, action, onDismiss }: ToastSpec & { onDismiss: () => void }) {
  return (
    <div className="pointer-events-auto flex w-full max-w-page items-center justify-between gap-3 rounded-md border border-border bg-surface-raised py-1 pl-4 pr-1 shadow-lg">
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
