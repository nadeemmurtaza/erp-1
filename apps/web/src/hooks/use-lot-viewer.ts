'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProxyBid, fetchViewerState } from '@/lib/auction-client';
import { spread, type ViewerLotState } from '@/lib/auction-live';
import { REGISTRATION_POLL_MS, VIEWER_MIN_GAP_MS, needsRegistrationPoll } from '@/lib/auction-registration';

/**
 * What the signed-in customer is to one lot: their alias once they have bid,
 * whether they may bid at all, and their own standing maximum. Held above the
 * bid box because the page needs it too: the history marks their bids and a
 * closed lot says whether they won.
 *
 * A read that fails leaves the viewer unknown (`null`), which the page treats as
 * "may bid": the API decides, and says so when it refuses.
 *
 * While the person's registration waits for the organiser, or an appeal does,
 * the hook asks again every 20 s ±20 % (`REGISTRATION_POLL_MS`) and once when
 * the tab becomes visible again, never in a hidden tab and never twice within a
 * second. The page changes by itself when the organiser decides; nothing is
 * pushed to the bidder (notifications are not built), so this read is how they
 * find out. If a read fails the last answer stays on screen and the next tick
 * tries again.
 */
export function useLotViewer(lotId: string, signedIn: boolean) {
  const [viewer, setViewer] = useState<ViewerLotState | null>(null);
  const [myMax, setMyMax] = useState<number | null>(null);

  const lastReadAt = useRef(0);

  const reload = useCallback(() => {
    lastReadAt.current = Date.now();
    void fetchViewerState(lotId)
      .then(setViewer)
      .catch(() => undefined);
  }, [lotId]);

  useEffect(() => {
    if (!signedIn) {
      setViewer(null);
      setMyMax(null);
      return;
    }
    let cancelled = false;
    lastReadAt.current = Date.now();
    fetchViewerState(lotId)
      .then((state) => !cancelled && setViewer(state))
      .catch(() => undefined);
    fetchProxyBid(lotId)
      .then((proxy) => !cancelled && setMyMax(proxy.maxMinor))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [lotId, signedIn]);

  const waiting = signedIn && needsRegistrationPoll(viewer);
  useEffect(() => {
    if (!waiting) return;
    let timer: number | undefined;
    const readIfDue = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastReadAt.current >= VIEWER_MIN_GAP_MS) reload();
    };
    const tick = () => {
      readIfDue();
      timer = window.setTimeout(tick, spread(REGISTRATION_POLL_MS));
    };
    timer = window.setTimeout(tick, spread(REGISTRATION_POLL_MS));
    document.addEventListener('visibilitychange', readIfDue);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', readIfDue);
    };
  }, [waiting, reload]);

  return { viewer, setViewer, myMax, setMyMax, reload };
}

export type LotViewer = ReturnType<typeof useLotViewer>;
