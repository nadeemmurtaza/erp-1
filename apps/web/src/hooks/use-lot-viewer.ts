'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProxyBid, fetchViewerState } from '@/lib/auction-client';
import { spread, type LotOutcome, type ViewerLotState } from '@/lib/auction-live';
import { REGISTRATION_POLL_MS, VIEWER_MIN_GAP_MS, needsRegistrationPoll } from '@/lib/auction-registration';
import { expectsSettlement, needsSettlementPoll, settlementPollMs } from '@/lib/auction-settlement';

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
 *
 * `result` is the lot's phase and public outcome. When it names this person as
 * the buyer, the invoice is made a few seconds after the close, so until it
 * appears the hook asks every 5 s for a minute and every 20 s after that
 * (`settlementPollMs`), on the same visibility and one-second rules.
 */
export function useLotViewer(lotId: string, signedIn: boolean, result: { phase: string; outcome?: LotOutcome } | null = null) {
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

  const expectingSettlement = result !== null && expectsSettlement(result.outcome, result.phase, viewer?.alias ?? null);
  const waitingOnOrganiser = signedIn && needsRegistrationPoll(viewer);
  const waitingOnInvoice = signedIn && needsSettlementPoll(viewer, expectingSettlement);
  const waiting = waitingOnOrganiser || waitingOnInvoice;
  useEffect(() => {
    if (!waiting) return;
    let timer: number | undefined;
    let reads = 0;
    const readIfDue = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastReadAt.current >= VIEWER_MIN_GAP_MS) reload();
    };
    const delay = () => spread(waitingOnInvoice ? settlementPollMs(reads) : REGISTRATION_POLL_MS);
    const tick = () => {
      reads += 1;
      readIfDue();
      timer = window.setTimeout(tick, delay());
    };
    timer = window.setTimeout(tick, delay());
    document.addEventListener('visibilitychange', readIfDue);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', readIfDue);
    };
  }, [waiting, waitingOnInvoice, reload]);

  return { viewer, setViewer, myMax, setMyMax, reload };
}

export type LotViewer = ReturnType<typeof useLotViewer>;
