'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@newax/shared';
import { fetchPublicLot, lotStreamUrl } from '@/lib/auction-client';
import {
  POLL_FALLBACK_MS,
  REFRESH_MIN_GAP_MS,
  applyLiveEvent,
  clockOffset,
  needsRefresh,
  newerView,
  spread,
  type LotLiveEvent,
  type PublicLot,
} from '@/lib/auction-live';

export type LotLoad = 'loading' | 'ready' | 'missing' | 'error';

/**
 * `live`: the server is pushing changes. `connecting`: asking for the stream.
 * `polling`: no stream (it dropped, was refused, or the lot is not open yet), so
 * the page reads the lot every few seconds instead.
 */
export type LiveConnection = 'connecting' | 'live' | 'polling';

/** The wait before asking for a stream again after one is refused: the server's own `retry:` of 5 000 ms. */
const RECONNECT_MS = 5_000;

/**
 * One lot, kept current (launchpad-apps/234-auction-app.md §6): read once, then
 * followed over the server-sent stream, with the same read repeated every five
 * seconds whenever there is no stream. The page never has to know which of the
 * two is feeding it: both end in the same view, and a view never goes backwards
 * (`newerView`, `applyLiveEvent`).
 *
 * Three more things it owns so a page does not:
 *  - the server's clock, as an offset from this machine's, taken from every
 *    message that carries `serverTime`, for the countdown;
 *  - a read of the lot when an event says it took a bid the page has not listed;
 *  - a stream only for an open lot. An upcoming lot is polled (nothing is
 *    published when an auction opens) and a closed one is final.
 */
export function useLotLive(lotId: string) {
  const [lot, setLot] = useState<PublicLot | null>(null);
  const [load, setLoad] = useState<LotLoad>('loading');
  const [offsetMs, setOffsetMs] = useState(0);
  const [connection, setConnection] = useState<LiveConnection>('connecting');
  const lastReadAt = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  /** The lot the page is on now, so a slow answer for the one it left is dropped. */
  const activeLot = useRef(lotId);

  const refresh = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    lastReadAt.current = Date.now();
    const read = fetchPublicLot(lotId)
      .then((incoming) => {
        if (activeLot.current !== lotId) return;
        setOffsetMs(clockOffset(incoming.serverTime, Date.now()));
        setLot((current) => (current && current.lotId === incoming.lotId ? newerView(current, incoming) : incoming));
        setLoad('ready');
      })
      .catch((error: unknown) => {
        if (activeLot.current !== lotId) return;
        if (error instanceof ApiError && error.status === 404) setLoad('missing');
        // A failed read of a page already showing keeps what it shows; the next poll tries again.
        else setLoad((current) => (current === 'ready' ? current : 'error'));
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = read;
    return read;
  }, [lotId]);

  /** Folds an event in. `clock: false` for one the page built itself from a bid's answer, whose `serverTime` is not a reading. */
  const applyEvent = useCallback((event: LotLiveEvent, options: { clock?: boolean } = {}) => {
    if (options.clock !== false) setOffsetMs(clockOffset(event.serverTime, Date.now()));
    setLot((current) => (current ? applyLiveEvent(current, event) : current));
  }, []);

  // Another lot: start over.
  useEffect(() => {
    activeLot.current = lotId;
    setLot(null);
    setLoad('loading');
    setConnection('connecting');
    inFlight.current = null;
    void refresh();
  }, [lotId, refresh]);

  const phase = lot?.phase;
  const streamable = phase === 'OPEN';

  // The stream, while the lot is open.
  useEffect(() => {
    if (!streamable) {
      setConnection('polling');
      return;
    }
    let source: EventSource | null = null;
    let reconnect: number | undefined;
    let opened = false;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setConnection('connecting');
      const next = new EventSource(lotStreamUrl(lotId));
      source = next;
      next.onopen = () => {
        setConnection('live');
        // Back after a gap: read the lot once, rather than trust that nothing was missed.
        if (opened) void refresh();
        opened = true;
      };
      next.addEventListener('lot', (message) => {
        try {
          applyEvent(JSON.parse((message as MessageEvent<string>).data) as LotLiveEvent);
        } catch {
          // A frame that is not an event is dropped; the next one, or a poll, brings the page level.
        }
      });
      next.onerror = () => {
        setConnection('polling');
        // A dropped connection retries itself. One the server refused (busy, or the lot gone) is closed for good, so ask again later.
        if (next.readyState === EventSource.CLOSED) {
          next.close();
          source = null;
          reconnect = window.setTimeout(connect, spread(RECONNECT_MS));
        }
      };
    };

    connect();
    return () => {
      disposed = true;
      source?.close();
      window.clearTimeout(reconnect);
    };
  }, [lotId, streamable, refresh, applyEvent]);

  // Without a stream, read the lot every few seconds until it is closed.
  const polling = connection !== 'live' && load === 'ready' && phase !== 'CLOSED';
  useEffect(() => {
    if (!polling) return;
    let timer: number | undefined;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      timer = window.setTimeout(() => {
        void refresh().finally(tick);
      }, spread(POLL_FALLBACK_MS));
    };
    tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [polling, refresh]);

  // An event can say the lot took a bid the page does not list; read it again, no more than once a second.
  const behind = lot !== null && needsRefresh(lot);
  const bidSeq = lot?.bidSeq;
  useEffect(() => {
    if (!behind) return;
    const wait = Math.max(0, REFRESH_MIN_GAP_MS - (Date.now() - lastReadAt.current));
    const timer = window.setTimeout(() => void refresh(), wait);
    return () => window.clearTimeout(timer);
  }, [behind, bidSeq, refresh]);

  return { lot, load, connection, offsetMs, refresh, applyEvent };
}
