import { useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';

/**
 * Asks before a consequential action; the confirm button names the action ("Delete folder").
 *
 * Two ways to use it:
 * - return a promise from {@code onConfirm}: the dialog shows progress and closes when it resolves
 *   (stays open on failure so the user can retry or cancel; the mutation reports the error);
 * - return nothing and drive {@code loading} yourself (e.g. from a mutation), closing it on success.
 */
export function ConfirmDialog({ open, onOpenChange, title, children, confirmLabel, danger, onConfirm, loading, disabled }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => unknown;
  loading?: boolean;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const result = onConfirm();
    if (!(result instanceof Promise)) return;
    setBusy(true);
    try {
      await result;
      onOpenChange(false);
    } catch {
      // Reported by the caller's mutation; keep the dialog open.
    } finally {
      setBusy(false);
    }
  };
  const working = busy || !!loading;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      width="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={working}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={working} disabled={disabled} onClick={() => void run()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[13.5px] text-ink">{children}</div>
    </Dialog>
  );
}
