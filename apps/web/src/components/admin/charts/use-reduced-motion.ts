import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/**
 * Recharts animates in JavaScript, which the stylesheet's reduced-motion rule
 * cannot reach, so a chart has to ask for itself. The server snapshot is
 * `false`: the chart is client-only (it measures its container), so there is no
 * first paint to disagree with.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
