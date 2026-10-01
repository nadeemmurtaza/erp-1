'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/utils/cn';
import { HOLD_IDLE, HOLD_MS, holdProgress, nextHold, type HoldEvent, type HoldState } from '@/lib/guard';

/**
 * A destructive control that is confirmed by holding it (DNG-1).
 *
 * What it communicates: *this will not happen by accident*. The ring fills
 * while the button is held and the act happens when it closes; letting go early
 * drains it and does nothing. It replaces the confirmation dialog for the middle
 * tier of `ACT-6` (irreversible or wide, but not financial): the friction is
 * the same and the page is not interrupted. The label does the dialog's other
 * job, so it must name the act and its object ("Delete project", "Void 3
 * sales"), which `isVagueLabel` and `scripts/check-danger.mjs` hold callers to
 * (DNG-2).
 *
 * Three ways in, because a gesture that only a pointer can make is closed to
 * everyone else:
 *
 *   - a pointer or finger held on the button;
 *   - Space or Enter held (a repeat does not count; releasing or leaving the
 *     button cancels), which is the keyboard's equivalent of the hold;
 *   - assistive technology and voice control, which activate a button with a
 *     click and have no hold to give: the first such click arms it ("activate
 *     again to confirm") and the second confirms. Arming does not time out (a
 *     time limit would be a barrier of its own, WCAG 2.2.1) and ends when focus
 *     leaves or Escape is pressed.
 *
 * The ring follows the clock, not a transition: `--hold` is written on the
 * button each frame from `performance.now()`, so under reduced motion it is the
 * same progress, drawn the same way, and nothing is lost. Only the drain on
 * release is a transition (`fast`), which the stylesheet collapses.
 *
 * The result is not the button's to show: the page that owns the object removes
 * it, or passes `loading`. This only decides *whether it was meant*.
 */
export function HoldToConfirm({
  children,
  onConfirm,
  holdMs = HOLD_MS,
  disabled = false,
  loading = false,
  loadingLabel = 'Working…',
  className,
}: {
  /** The act and its object: "Delete project". Never "Yes" or "Confirm". */
  children: ReactNode;
  onConfirm: () => void | Promise<void>;
  /** How long to hold, in ms. Defaults to the brand's `safeguards.holdToConfirmMs`. */
  holdMs?: number;
  disabled?: boolean;
  /** The act is running: the button disables itself and says so, as `Button` does. */
  loading?: boolean;
  loadingLabel?: string;
  className?: string;
}) {
  const hintId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const hold = useRef<HoldState>(HOLD_IDLE);
  const frame = useRef<number | null>(null);
  // A click that was not preceded by a pointer press came from assistive technology or voice control.
  const pointerSeen = useRef(false);
  // What a screen reader is told. Changes only at the edges of a hold, never per frame.
  const [message, setMessage] = useState('');
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);

  const seconds = holdMs / 1000;
  const hint = `Press and hold for ${seconds} ${seconds === 1 ? 'second' : 'seconds'} to confirm.`;
  const inactive = disabled || loading;

  const paint = useCallback((value: number) => {
    button.current?.style.setProperty('--hold', String(value));
  }, []);

  const stopFrames = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  const apply = useCallback(
    (event: HoldEvent): boolean => {
      const result = nextHold(hold.current, event, holdMs);
      hold.current = result.state;
      return result.fired;
    },
    [holdMs],
  );

  const run = useCallback(() => {
    const step = (now: number) => {
      const fired = apply({ type: 'tick', now });
      paint(holdProgress(hold.current, now, holdMs));
      if (fired) {
        frame.current = null;
        setMessage('Confirmed.');
        void onConfirm();
        return;
      }
      if (hold.current.phase === 'holding') frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [apply, holdMs, onConfirm, paint]);

  const start = useCallback(() => {
    if (inactive) return;
    apply({ type: 'down', now: performance.now() });
    if (hold.current.phase !== 'holding') return;
    setArmed(false);
    setHolding(true);
    setMessage('');
    paint(0);
    run();
  }, [apply, inactive, paint, run]);

  const stop = useCallback(
    (announce: boolean) => {
      const wasHolding = hold.current.phase === 'holding';
      stopFrames();
      apply({ type: 'up' });
      setHolding(false);
      paint(0);
      if (announce && wasHolding) setMessage(`Not confirmed. ${hint}`);
    },
    [apply, hint, paint, stopFrames],
  );

  // A frame left running after unmount would call back into a component that is gone.
  useEffect(() => stopFrames, [stopFrames]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      if (armed) setArmed(false);
      if (holding) stop(true);
      return;
    }
    if (event.key !== ' ' && event.key !== 'Enter') return;
    // Without this the key would also click the button when it is released.
    event.preventDefault();
    if (!event.repeat) start();
  };

  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    stop(true);
  };

  const onClick = () => {
    const viaPointer = pointerSeen.current;
    pointerSeen.current = false;
    // A click that follows a real press is the end of a hold, already judged; only a bare click is assistive.
    if (viaPointer || inactive) return;
    if (armed) {
      setArmed(false);
      setMessage('Confirmed.');
      void onConfirm();
      return;
    }
    setArmed(true);
    setMessage('Activate again to confirm.');
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        disabled={inactive}
        aria-busy={loading || undefined}
        aria-describedby={hintId}
        data-holding={holding || undefined}
        data-armed={armed || undefined}
        title={hint}
        className={cn('btn-hold', className)}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          pointerSeen.current = true;
          start();
        }}
        onPointerUp={() => stop(true)}
        onPointerLeave={() => stop(true)}
        onPointerCancel={() => stop(false)}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => {
          setArmed(false);
          stop(false);
        }}
        onClick={onClick}
      >
        {loading ? (
          <>
            <span aria-hidden="true" className="spinner" />
            {loadingLabel}
          </>
        ) : (
          <>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="hold-ring">
              <circle cx="12" cy="12" r="10" className="hold-ring-track" />
              <circle cx="12" cy="12" r="10" pathLength="1" className="hold-ring-fill" />
            </svg>
            <span>
              {children}
              {/* The act stays in the name when armed, so a screen reader or a voice command still hears what it is. */}
              {armed ? <span className="font-normal"> · activate again</span> : null}
            </span>
          </>
        )}
        <span aria-hidden="true" className="hold-bar" />
      </button>
      <span id={hintId} className="sr-only">
        {hint}
      </span>
      <span role="status" className="sr-only">
        {message}
      </span>
    </>
  );
}
