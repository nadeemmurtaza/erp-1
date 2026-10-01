import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/** Read once, outside React: for a timer or an event handler that has no render to subscribe from. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(QUERY).matches;
}

/**
 * The stylesheet's reduced-motion rule collapses every CSS animation and
 * transition, but it cannot reach motion that JavaScript drives: a Recharts
 * series, a figure counting up, a code decoding, a toast that waits for its
 * exit before unmounting. Those ask for themselves, here.
 *
 * The server snapshot is `false`. Everything that reads this either animates
 * on the client only (it has no first paint to disagree with) or starts from
 * the end state on the server, so a reader who asked for no motion never sees
 * a frame of it either way.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
