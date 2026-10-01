'use client';

import { useState } from 'react';
import { Dialog } from './dialog';
import { Button } from './button';
import { cn } from '@/utils/cn';

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
 *     confirmLabel="Archive recipe"
 *   />
 *
 * Two rules about the buttons that were not true before:
 *
 *   - `confirmLabel` is required and names the act and its object ("Archive
 *     recipe", never "Confirm"), because the button is read last and fastest
 *     (DNG-2). `scripts/check-danger.mjs` fails a vague literal.
 *   - A destructive confirmation puts the safe choice where the primary action
 *     usually is and gives it focus: Cancel sits at the inline end and is focused
 *     on open, so Enter does the safe thing, and the destructive button sits
 *     apart at the inline start (DNG-3, `ACT-2`). The gentler `primary` variant
 *     keeps the usual order, because nothing is being destroyed.
 *
 * For the middle tier of `ACT-6` a hold on the button itself (`HoldToConfirm`)
 * replaces this dialog; the typed-name tier and anything that needs a consequence
 * paragraph still use it.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
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
  /** The act and its object: "Delete option template". Required; never "Yes" or "Confirm" (DNG-2). */
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  /** Disables both buttons and swaps the confirm label while the action runs. */
  busy?: boolean;
  typeToConfirm?: string;
}) {
  const [typed, setTyped] = useState('');
  const locked = typeToConfirm !== undefined && typed !== typeToConfirm;
  const destructive = variant === 'danger';
  const confirm = (
    <Button variant={variant} onClick={onConfirm} disabled={busy || locked} loading={busy} loadingLabel="Working…">
      {confirmLabel}
    </Button>
  );

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      footer={
        <div className={cn('flex gap-2', destructive ? 'justify-between' : 'justify-end')}>
          {destructive ? confirm : null}
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={busy}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- a destructive confirmation opens on its safe choice, so the key pressed by reflex (Enter) cancels instead of destroying (DNG-3); the Dialog only takes focus itself when nothing inside has claimed it.
            autoFocus={destructive}
          >
            {cancelLabel}
          </Button>
          {destructive ? null : confirm}
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
