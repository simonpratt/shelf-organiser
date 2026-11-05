// Confirmation before an action that can't be undone, in the app's styling.
import type { ReactNode } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

type Props = {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string;
};

export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel, busy, error }: Props) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <div className="text-muted">{children}</div>
      {error && <Banner>{error}</Banner>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" busy={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}
