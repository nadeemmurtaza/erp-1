'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchProxyBid, fetchViewerState } from '@/lib/auction-client';
import type { ViewerLotState } from '@/lib/auction-live';

/**
 * What the signed-in customer is to one lot: their alias once they have bid,
 * whether they may bid at all, and their own standing maximum. Held above the
 * bid box because the page needs it too: the history marks their bids and a
 * closed lot says whether they won.
 *
 * A read that fails leaves the viewer unknown (`null`), which the page treats as
 * "may bid": the API decides, and says so when it refuses.
 */
export function useLotViewer(lotId: string, signedIn: boolean) {
  const [viewer, setViewer] = useState<ViewerLotState | null>(null);
  const [myMax, setMyMax] = useState<number | null>(null);

  const reload = useCallback(() => {
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

  return { viewer, setViewer, myMax, setMyMax, reload };
}

export type LotViewer = ReturnType<typeof useLotViewer>;
