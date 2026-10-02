'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/utils/cn';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { MOTION_MS, nextSwap, type SwapState } from '@/lib/motion';

/**
 * A short value that changes in place: the old text leaves, the new text arrives.
 *
 * What it communicates: *this is the same thing, now different*. A status that
 * moves from Pending to Paid, a count that goes from Open to Closed. It is for
 * a label of a few words that stays where it is; a figure that is climbing is
 * `CountUp`, and a code that was just assigned is `ScrambleText`. The old text
 * rises out over `fast` while the new text rises in over `normal`, `nudge` (4px)
 * each, stacked in one grid cell so the line does not reflow mid-swap.
 *
 * The first render is just the text. The leaving copy is `aria-hidden` and gone
 * once it has left, so a screen reader meets exactly one value. Reduced motion
 * keeps no leaving copy: it is a plain change.
 */
export function SwapText({ value, className }: { value: string; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [state, setState] = useState<SwapState>({ current: value, previous: null, changes: 0 });

  // A change of `value` becomes new state during render, so there is never a frame
  // that shows the new text with no old one to leave.
  const next = nextSwap(state, value, reduced);
  if (next !== state) setState(next);

  const leaving = state.previous;
  useEffect(() => {
    if (leaving === null) return;
    const timer = window.setTimeout(() => setState((s) => ({ ...s, previous: null })), MOTION_MS.exit);
    return () => window.clearTimeout(timer);
  }, [leaving, state.changes]);

  return (
    <span className={cn('swap', className)}>
      {/* Keyed by the change count, so every change is a new element that plays `swap-in` once and keeps the class; the first value has none and does not animate. */}
      <span key={state.changes} className={state.changes === 0 ? undefined : 'swap-in'}>
        {state.current}
      </span>
      {leaving === null ? null : (
        <span aria-hidden="true" className="swap-out">
          {leaving}
        </span>
      )}
    </span>
  );
}
