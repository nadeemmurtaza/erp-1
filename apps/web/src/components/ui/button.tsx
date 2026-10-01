import { Check } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { DrawIcon } from './draw-icon';

/**
 * The button.
 *
 * There used to be a `surface` prop here, because admin buttons were
 * rectangular and teal while storefront buttons were pills and grey. That
 * split is gone — globals.css has one `.btn-*` family now — so the prop went
 * with it. If you find yourself wanting it back, the answer is a new variant,
 * not a second shape language.
 *
 * A plain `<button className="btn-primary">` still works and is not wrong.
 * Reach for this when you want `loading`, which disables the button and swaps
 * the label so a double-submit is impossible. The swap is visible as well as
 * announced: a ring turns beside "Working…", so a click that was accepted is
 * seen to have been, in the frame it happened (`ACT-3`), however long the
 * result takes. Press, fill and the ring are all CSS (`.btn`, `.spinner`).
 *
 * `done` is the other end of the same action (FRM-6, `COG-13`): when the
 * request succeeds the ring is replaced by a check that draws itself over
 * `slow`, beside `doneLabel`, so the end of the action is seen as well as the
 * start. A done button stays disabled, so a second submit is as impossible as it
 * was while loading, and it is announced once through a status region. The page
 * decides when `done` ends (usually by navigating away).
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const CLASSES: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Disables the button and swaps the label, so a double-submit is impossible. */
  loading?: boolean;
  loadingLabel?: string;
  /** The action succeeded: the ring becomes a drawn check, and the button stays disabled. */
  done?: boolean;
  doneLabel?: string;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  loadingLabel,
  done = false,
  doneLabel,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <>
      <button
        type={type}
        disabled={disabled || loading || done}
        aria-busy={loading || undefined}
        className={cn(CLASSES[variant], className)}
        {...rest}
      >
        {done ? (
          <>
            <DrawIcon>
              <Check className="h-icon-md w-icon-md" aria-hidden="true" />
            </DrawIcon>
            {doneLabel ?? 'Done'}
          </>
        ) : loading ? (
          <>
            <span aria-hidden="true" className="spinner" />
            {loadingLabel ?? 'Working…'}
          </>
        ) : (
          children
        )}
      </button>
      {done ? (
        <span role="status" className="sr-only">
          {doneLabel ?? 'Done'}
        </span>
      ) : null}
    </>
  );
}
