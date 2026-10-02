'use client';

import { useCallback, useState } from 'react';
import { MOTION_MS } from '@/lib/motion';
import { prefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';

/**
 * The beat between "it worked" and "we left" (FRM-6, `COG-13`).
 *
 * A sign-in that succeeds and navigates in the same instant shows the person
 * nothing: the end of the action is the part they remember (peak-end), and it
 * was never on screen. `finish()` marks the action done, so `Button done` draws
 * its check, and resolves after one `slow` (320 ms), so the page that awaits it
 * leaves just after the check has been drawn. Under reduced motion there is no
 * check to draw and no wait: it resolves at once, and the label still says
 * "Done" for as long as the button is on screen.
 *
 *   const { done, finish } = useDoneBeat();
 *   await signIn();
 *   await finish();
 *   router.push(next);
 *
 * One state, no timer left running: if the page unmounts during the beat the
 * promise still resolves and the caller's navigation simply happens.
 */
export function useDoneBeat(): { done: boolean; finish: () => Promise<void> } {
  const [done, setDone] = useState(false);

  const finish = useCallback(async () => {
    setDone(true);
    if (prefersReducedMotion()) return;
    await new Promise<void>((resolve) => window.setTimeout(resolve, MOTION_MS.done));
  }, []);

  return { done, finish };
}
