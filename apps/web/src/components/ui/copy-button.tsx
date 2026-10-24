'use client';

import { Check, CircleAlert, Copy } from 'lucide-react';
import { useEffect, useReducer, useRef, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { COPY_IDLE, copyHoldMs, copyText, nextCopy, normalizeCopyValue } from '@/lib/copy';

/**
 * A button that copies one value and proves it did (CPY-1 to CPY-5).
 *
 * What it communicates: *it is on your clipboard now*, or, when it is not, *it
 * is not, and here is what to do*. A copy button that does nothing visible
 * leaves the person pasting into a terminal to find out, so every result shows:
 *
 *   - the copy icon becomes a check on the frame the write succeeds, with no
 *     spinner in front of it (CPY-1);
 *   - the check holds for `BRAND.feedback.copiedHoldMs` and fades back, so the
 *     control is never left stuck; a second copy inside the hold replays a pulse
 *     and restarts the clock (CPY-2);
 *   - the value is the string it was given, with what is invisible removed, never
 *     text read back from the page (CPY-3, `lib/copy.ts`);
 *   - a status region says "Copied" aloud, mounted before the click so it is
 *     heard, while the button's own name stays put (CPY-4);
 *   - without a secure origin it falls back to the copy command, and when that
 *     fails too it shows a failure icon, says why in words and calls `onFail`
 *     (CPY-5).
 *
 * The failure is not left to colour: the icon is a different shape and the
 * sentence beside it is words. The icons are stacked in one grid cell and
 * cross-fade on opacity and scale,
 * so nothing reflows when they swap, and the stylesheet's reduced-motion rule
 * turns the fade into an instant change: the state is still shown. A repeat
 * copy under reduced motion shows no new frame (the pulse is an animation), but
 * it is announced again and it restarts the hold.
 *
 * It renders nothing for a value that is empty once the invisible characters are
 * gone: there is nothing to copy, and a control that cannot work is worse than
 * none. `value` must be a string known at click time, never fetched in the
 * handler, because Safari only honours the write inside the gesture.
 *
 * `label` is the accessible name and does not change. The `labelled` variant
 * also shows it, and shows `copiedLabel` for the length of the hold; it is for a
 * place with room (a secret that is shown once). The `icon` variant is for a
 * value in a row of details.
 */
export interface CopyButtonProps {
  /** What to copy, as the code holds it: not a formatted copy of it. */
  value: string;
  /** The accessible name, and the visible word in the `labelled` variant: "Copy", "Copy account number". */
  label: string;
  /** What the status region says when it worked, and what the `labelled` variant shows for the hold: "Copied". */
  copiedLabel: string;
  /** What it says, and shows beside the button, when neither route worked. Names the remedy (FLO-7). */
  failedLabel: string;
  variant?: 'icon' | 'labelled';
  /** Called when neither route worked, so the caller can select the visible text for a manual copy. */
  onFail?: () => void;
  className?: string;
}

/**
 * One face of the button. Faces are stacked in a grid cell; the one that is `on`
 * is opaque and the others are not. Going to a result takes `instant` and coming
 * back takes `normal`, set by the caller as `quick`, because a transition takes
 * the duration of the state it is going to.
 *
 * `pulse` is the copy count while this face is showing a result. The inner span
 * is keyed by it, so a repeat copy remounts that span and plays `.pop` once,
 * while the outer span, which owns the fade, stays put and so is never cut short.
 */
function Face({
  on,
  quick,
  pulse = 0,
  scale = true,
  children,
}: {
  on: boolean;
  quick: boolean;
  pulse?: number;
  scale?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'col-start-1 row-start-1 inline-flex items-center justify-center transition-[opacity,transform] ease-settle',
        quick ? 'duration-instant' : 'duration-normal',
        on ? 'opacity-100' : 'opacity-0',
        scale && (on ? 'scale-100' : 'scale-[var(--motion-scale-pop)]'),
      )}
    >
      <span key={pulse} className={cn('inline-flex', pulse > 1 && 'pop')}>
        {children}
      </span>
    </span>
  );
}

export function CopyButton({
  value,
  label,
  copiedLabel,
  failedLabel,
  variant = 'icon',
  onFail,
  className,
}: CopyButtonProps) {
  const button = useRef<HTMLButtonElement>(null);
  const [state, dispatch] = useReducer(nextCopy, COPY_IDLE);

  // Every result is a new state object, so a repeat copy clears the old timer and starts a full hold.
  useEffect(() => {
    const hold = copyHoldMs(state);
    if (hold === null || state.phase === 'idle') return;
    const { n } = state;
    const timer = window.setTimeout(() => dispatch({ type: 'expire', n }), hold);
    return () => window.clearTimeout(timer);
  }, [state]);

  // A check is a claim about the value that was copied; once the value changes it no longer stands.
  useEffect(() => dispatch({ type: 'reset' }), [value]);

  if (normalizeCopyValue(value) === '') return null;

  async function copy() {
    const via = await copyText(value, button.current);
    if (via === 'failed') {
      dispatch({ type: 'failed' });
      onFail?.();
    } else {
      dispatch({ type: 'copied' });
    }
  }

  const idle = state.phase === 'idle';
  const copied = state.phase === 'copied';
  const failed = state.phase === 'failed';
  const quick = !idle;
  const message = copied ? copiedLabel : failed ? failedLabel : '';

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-2', className)}>
      <button
        ref={button}
        type="button"
        aria-label={label}
        data-state={state.phase}
        onClick={() => void copy()}
        className={variant === 'icon' ? 'btn-ghost min-w-touch px-0 fold:min-w-control-md' : 'btn-secondary'}
      >
        <span className="grid place-items-center">
          <Face on={idle} quick={quick}>
            <Copy className="h-icon-md w-icon-md" />
          </Face>
          <Face on={copied} quick={quick} pulse={copied ? state.n : 0}>
            <Check className="h-icon-md w-icon-md" />
          </Face>
          <Face on={failed} quick={quick} pulse={failed ? state.n : 0}>
            <CircleAlert className="h-icon-md w-icon-md" />
          </Face>
        </span>
        {variant === 'labelled' ? (
          <span className="grid">
            <Face on={!copied} quick={quick} scale={false}>
              {label}
            </Face>
            <Face on={copied} quick={quick} scale={false}>
              {copiedLabel}
            </Face>
          </span>
        ) : null}
      </button>
      {/*
        Always mounted, so it is a live region before anything is said in it. The text is keyed by the
        copy count, so a second, identical "Copied" is a new node and is announced again. It is visually
        hidden until it is the failure, which is for everyone and so is shown.
      */}
      <span role="status" className={failed ? 'text-xs text-red-700' : 'sr-only'}>
        <span key={idle ? 0 : `${state.phase}-${state.n}`}>{message}</span>
      </span>
    </span>
  );
}
