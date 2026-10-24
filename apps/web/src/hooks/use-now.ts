'use client';

import { useEffect, useState } from 'react';

/**
 * This machine's clock, re-read every `intervalMs` while `active`. A countdown
 * is `msUntil(end, offset, now)`; the offset that corrects it for a wrong clock
 * lives with the lot (`clockOffset`), so this stays a plain ticker.
 *
 * Starts at 0 and reads the real time in an effect, so the server render and the
 * first client render agree (a countdown is never in the prerendered page) and a
 * caller treats 0 as "not ticking yet".
 */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, active]);

  return now;
}
