import { useEffect, useRef, useState } from 'react';
import { MOTION_MS } from '@/lib/motion';
import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

/**
 * True for one `sweep` after `changeKey` changes from one value to another;
 * never on first render, and not when a value first arrives (`null` or
 * `undefined` to something), which is an arrival, not a change.
 *
 * It is the switch for the sheen (`.sheen[data-fresh]` in globals.css): a figure
 * that was recomputed, a record that was just saved. The key is whatever
 * identifies the data (the figure itself, a version, an id), so an identical
 * re-render says nothing and a refetch that returns the same value is silent.
 * Reduced motion never raises it: the new value is on screen either way.
 */
export function useFreshOnChange(changeKey: unknown): boolean {
  const reduced = usePrefersReducedMotion();
  const last = useRef(changeKey);
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (Object.is(last.current, changeKey)) return;
    const arrival = last.current == null;
    last.current = changeKey;
    if (reduced || arrival) return;
    setFresh(true);
    const timer = window.setTimeout(() => setFresh(false), MOTION_MS.sheen);
    return () => window.clearTimeout(timer);
  }, [changeKey, reduced]);

  return fresh;
}
