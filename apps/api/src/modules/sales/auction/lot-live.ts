/**
 * What a lot says about itself to anyone watching it live (launchpad-apps/
 * 234-auction-app.md §6, §11, WO-234.4). Pure types and one merge, so the
 * writer's publish, the node's conflation and the page's reading all agree on
 * one shape, and the arithmetic is tested without a server.
 *
 * An event is a snapshot, not a delta: it carries the whole current price
 * state, with the bids accepted since the last one only as a convenience. That
 * is what lets a slow or disconnected watcher skip any number of events and
 * lose nothing — the next one, or a plain read of the lot, brings it level —
 * and what lets a node drop updates to a consumer that cannot keep up instead
 * of buffering them without bound.
 */

/** Bids carried by one event. More than a node batches in one window is a burst; the page reads the rest from the lot. */
export const MAX_EVENT_BIDS = 20;

export interface LiveBid {
  seq: number;
  /** "Bidder 7", never a name. */
  alias: string;
  amountMinor: number;
  kind: 'MANUAL' | 'PROXY_AUTO' | 'SEALED';
  acceptedAt: string;
}

/** How a lot ended, as the public may see it: never the reserve, only whether it was sold. */
export type LotPublicOutcome =
  | { kind: 'SOLD'; topBidderAlias: string; finalMinor: number }
  | { kind: 'NOT_SOLD'; reason: 'RESERVE_NOT_MET' | 'NO_BIDS' };

export type LotLiveState = 'UPCOMING' | 'OPEN' | 'CLOSED';

/** A lot only ever moves forward through its states, so an event for an earlier one is out of date. */
const STATE_RANK: Record<LotLiveState, number> = { UPCOMING: 0, OPEN: 1, CLOSED: 2 };

export interface LotLiveEvent {
  lotId: string;
  /** `UPCOMING` before the auction opens, `OPEN` while bidding is possible, `CLOSED` once the lot has ended. */
  state: LotLiveState;
  /** How many bids the lot has accepted; also the version a page compares to see it has missed one. */
  bidSeq: number;
  currentBidMinor: number | null;
  /** What the next bid must reach; null once closed. */
  minimumNextBidMinor: number | null;
  /** When bidding on the lot ends (ISO): moved by anti-snipe or by recovery after an outage. */
  endsAt: string;
  /** The database clock when this was made, so a page can correct its countdown on every message. */
  serverTime: string;
  /** Bids accepted since the previous event, oldest first. */
  newBids: LiveBid[];
  outcome?: LotPublicOutcome;
}

/**
 * Two events for one lot as one: everything the newer says wins, and the bids
 * of both are kept, once each by `seq`, the latest `MAX_EVENT_BIDS`. A newer
 * event with a lower `bidSeq` is out of order (a Redis message that overtook a
 * local one) and loses to the older: nothing a page has seen ever goes
 * backwards.
 */
export function mergeLiveEvents(older: LotLiveEvent, newer: LotLiveEvent): LotLiveEvent {
  if (newer.bidSeq < older.bidSeq || (newer.bidSeq === older.bidSeq && STATE_RANK[newer.state] < STATE_RANK[older.state])) {
    return mergeBids(older, newer);
  }
  return mergeBids(newer, older);
}

function mergeBids(winner: LotLiveEvent, other: LotLiveEvent): LotLiveEvent {
  const bySeq = new Map<number, LiveBid>();
  for (const bid of [...other.newBids, ...winner.newBids]) bySeq.set(bid.seq, bid);
  const newBids = [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-MAX_EVENT_BIDS);
  return { ...winner, newBids };
}

/**
 * The event for a commit that has just been accepted: the lot's price state
 * after it, and the bids it wrote (a manual bid and, when a standing maximum
 * answered it, that bid too). `serverTime` is the database clock the bids were
 * accepted at, so it needs no clock of the publisher's own.
 */
export function eventForAcceptedBids(
  lot: { lotId: string; bidSeq: number; currentBidMinor: number | null; minimumNextBidMinor: number; endsAt: Date },
  bids: ReadonlyArray<{ seq: number; alias: string; amountMinor: number; kind: LiveBid['kind']; acceptedAt: Date }>,
): LotLiveEvent {
  const last = bids[bids.length - 1];
  return {
    lotId: lot.lotId,
    state: 'OPEN',
    bidSeq: lot.bidSeq,
    currentBidMinor: lot.currentBidMinor,
    minimumNextBidMinor: lot.minimumNextBidMinor,
    endsAt: lot.endsAt.toISOString(),
    serverTime: (last?.acceptedAt ?? new Date()).toISOString(),
    newBids: bids.map((bid) => ({
      seq: bid.seq,
      alias: bid.alias,
      amountMinor: bid.amountMinor,
      kind: bid.kind,
      acceptedAt: bid.acceptedAt.toISOString(),
    })),
  };
}
