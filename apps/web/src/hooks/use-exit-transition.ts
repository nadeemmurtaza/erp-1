'use client';

import { useEffect, useState } from 'react';
import { MOTION_MS } from '@/lib/motion';
import { prefersReducedMotion, usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

/**
 * Lets something that unmounts get an exit.
 *
 * React removes an element the instant its condition goes false, so a dialog
 * or a toast cannot fade out — it simply vanishes, which reads as a glitch next
 * to an entrance that was animated. This keeps the element mounted for one exit
 * duration after `open` turns false and tells the caller it is `leaving`, so it
 * can swap its enter class for a leave class and ignore pointer events.
 *
 * The exit is `MOTION_MS.exit` (the `fast` token — leaving is quicker than
 * arriving) and the same token drives the `leave` animation in the stylesheet,
 * so the unmount cannot drift from the CSS. Under reduced motion the wait is
 * zero: the element is gone at once and nothing was waiting on a movement that
 * is not going to happen.
 */
export function useExitTransition(open: boolean): { mounted: boolean; leaving: boolean } {
  const reduced = usePrefersReducedMotion();
  const [rendered, setRendered] = useState(open);

  // Adjust state during render, not in an effect: the moment `open` is true the
  // element must already count as rendered, or the first exit has nothing to wait on.
  if (open && !rendered) setRendered(true);

  useEffect(() => {
    if (open || !rendered) return;
    const wait = prefersReducedMotion() ? 0 : MOTION_MS.exit;
    const timer = window.setTimeout(() => setRendered(false), wait);
    return () => window.clearTimeout(timer);
  }, [open, rendered]);

  // Reduced motion: gone the same render `open` turns false, not one timer tick later.
  if (reduced) return { mounted: open, leaving: false };
  return { mounted: open || rendered, leaving: !open && rendered };
}
