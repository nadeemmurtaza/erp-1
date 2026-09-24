'use client';

import { useState } from 'react';
import { Dialog } from './dialog';
import { Button } from './button';

/**
 * The one way a destructive action gets confirmed.
 *
 * Five admin pages asked the browser's own `confirm()` for this instead —
 * no focus trap, no `role="dialog"`, unstyled, and the WCAG failure that
 * comes with a native dialog: a screen reader announces it as a plain
 * unlabelled alert, not a modal with a name. `Dialog` already gets the
 * accessibility contract right; this just gives it the one shape every
 * destructive confirmation needs (the design system's own ACT-6: reversible
 * and small → do it, offer undo; irreversible or wide → name the object and
 * the count; irreversible AND financial or cross-branch → require typing the
 * name).
 *
 *   const [open, setOpen] = useState(false);
 *   <ConfirmDialog
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     onConfirm={archive}
 *     title="Archive this recipe?"
 *     description="It stops appearing on new production runs. Past runs are unaffected."
 *     confirmLabel="Archive"
 *   />
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  busy = false,
  /** For the top ACT-6 tier: irreversible AND financial or cross-branch. The
   * confirm button stays disabled until this exact text is typed. */
  typeToConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  /** The consequence, in plain words — what happens and what does not. */
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  /** Disables both buttons and swaps the confirm label while the action runs. */
  busy?: boolean;
  typeToConfirm?: string;
}) {
  const [typed, setTyped] = useState('');
  const locked = typeToConfirm !== undefined && typed !== typeToConfirm;

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            disabled={busy || locked}
            loading={busy}
            loadingLabel="Working…"
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-neutral-900/70">{description}</p>
      {typeToConfirm ? (
        <div className="mt-4">
          <label className="field-label" htmlFor="confirm-dialog-type-to-confirm">
            Type <span className="font-semibold text-neutral-900">{typeToConfirm}</span> to
            confirm
          </label>
          <input
            id="confirm-dialog-type-to-confirm"
            type="text"
            className="field-input mt-1"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </div>
      ) : null}
    </Dialog>
  );
}
