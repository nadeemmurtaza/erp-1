import { ApiError } from '@newax/shared';
import { describe, expect, it } from 'vitest';
import {
  CLOSING_SOON_MS,
  MAX_AMOUNT_MINOR,
  PAGE_BIDS,
  amountForInput,
  applyLiveEvent,
  clockOffset,
  countdownParts,
  countdownUnits,
  describeBidFailure,
  eventFromAccepted,
  msUntil,
  needsRefresh,
  newerView,
  parseAmountToMinor,
  shownPriceMinor,
  spread,
  standingOf,
  timeState,
  type LiveBid,
  type LotLiveEvent,
  type PublicLot,
} from './auction-live';

const bid = (seq: number, alias = 'Bidder 1', amountMinor = 100_000 + seq * 5_000, kind: LiveBid['kind'] = 'MANUAL'): LiveBid => ({
  seq,
  alias,
  amountMinor,
  kind,
  acceptedAt: '2026-10-10T12:00:00.000Z',
});

const lot = (over: Partial<PublicLot> = {}): PublicLot => ({
  lotId: 'lot-1',
  lotNo: 1,
  title: 'Pallet of denim',
  description: null,
  quantity: 1,
  images: [],
  auction: { id: 'a-1', number: 'AUC-2026-0001', title: 'October clearance', status: 'OPEN', startsAt: '2026-10-10T10:00:00.000Z', terms: null, buyerPremiumBps: 0, paymentWindowHours: 72 },
  phase: 'OPEN',
  startPriceMinor: 100_000,
  currentBidMinor: null,
  bidSeq: 0,
  minimumNextBidMinor: 100_000,
  endsAt: '2026-10-10T13:00:00.000Z',
  extended: false,
  serverTime: '2026-10-10T12:00:00.000Z',
  bids: [],
  ...over,
});

const event = (over: Partial<LotLiveEvent> = {}): LotLiveEvent => ({
  lotId: 'lot-1',
  state: 'OPEN',
  bidSeq: 1,
  currentBidMinor: 105_000,
  minimumNextBidMinor: 110_250,
  endsAt: '2026-10-10T13:00:00.000Z',
  serverTime: '2026-10-10T12:00:05.000Z',
  newBids: [bid(1)],
  ...over,
});

describe('the server clock', () => {
  it('is how far the server is ahead of this machine, and corrects a deadline by it', () => {
    const offset = clockOffset('2026-10-10T12:00:10.000Z', Date.parse('2026-10-10T12:00:00.000Z'));
    expect(offset).toBe(10_000);
    // This machine reads 12:00:00; the server reads 12:00:10; an end of 12:01:00 is 50 s away.
    expect(msUntil('2026-10-10T12:01:00.000Z', offset, Date.parse('2026-10-10T12:00:00.000Z'))).toBe(50_000);
  });

  it('is negative past the end', () => {
    expect(msUntil('2026-10-10T12:00:00.000Z', 0, Date.parse('2026-10-10T12:00:03.000Z'))).toBe(-3_000);
  });
});

describe('countdownParts and countdownUnits', () => {
  it('splits a span into whole units, flooring the seconds', () => {
    expect(countdownParts(2 * 86_400_000 + 4 * 3_600_000 + 12 * 60_000 + 30_999)).toEqual({ days: 2, hours: 4, minutes: 12, seconds: 30 });
  });

  it('is all zeros at and below zero', () => {
    expect(countdownParts(0)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    expect(countdownParts(-5_000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });

  it('keeps the two largest units that apply', () => {
    expect(countdownUnits(2 * 86_400_000 + 4 * 3_600_000 + 12 * 60_000)).toEqual([{ unit: 'd', value: 2 }, { unit: 'h', value: 4 }]);
    expect(countdownUnits(4 * 3_600_000 + 12 * 60_000 + 30_000)).toEqual([{ unit: 'h', value: 4 }, { unit: 'm', value: 12 }]);
    expect(countdownUnits(12 * 60_000 + 30_000)).toEqual([{ unit: 'm', value: 12 }, { unit: 's', value: 30 }]);
    expect(countdownUnits(30_000)).toEqual([{ unit: 's', value: 30 }]);
  });

  it('shows the next unit even when it is zero, so "1h" never reads as a rounded value', () => {
    expect(countdownUnits(3_600_000)).toEqual([{ unit: 'h', value: 1 }, { unit: 'm', value: 0 }]);
  });

  it('shows 0s for nothing left', () => {
    expect(countdownUnits(0)).toEqual([{ unit: 's', value: 0 }]);
  });
});

describe('timeState', () => {
  const now = Date.parse('2026-10-10T12:00:00.000Z');

  it('is closing soon inside the window, with the boundary itself inside', () => {
    expect(timeState(lot({ endsAt: '2026-10-10T13:00:00.000Z' }), 0, now)).toBe('open');
    expect(timeState(lot({ endsAt: new Date(now + CLOSING_SOON_MS).toISOString() }), 0, now)).toBe('closing-soon');
    expect(timeState(lot({ endsAt: new Date(now + CLOSING_SOON_MS + 1).toISOString() }), 0, now)).toBe('open');
  });

  it('is ended once the end has passed, even before the server has said so', () => {
    expect(timeState(lot({ endsAt: new Date(now - 1).toISOString() }), 0, now)).toBe('ended');
  });

  it('follows the phase for a lot that has not opened or has closed', () => {
    expect(timeState(lot({ phase: 'UPCOMING' }), 0, now)).toBe('upcoming');
    expect(timeState(lot({ phase: 'CLOSED', endsAt: '2099-01-01T00:00:00.000Z' }), 0, now)).toBe('ended');
  });

  it('counts on the server’s clock, not this machine’s', () => {
    // This machine is 10 minutes slow: by its clock the lot has 14 minutes left, by the server's 4.
    const slow = now - 600_000;
    const endsAt = new Date(now + 240_000).toISOString();
    expect(timeState(lot({ endsAt }), 0, slow)).toBe('open');
    expect(timeState(lot({ endsAt }), 600_000, slow)).toBe('closing-soon');
  });
});

describe('applyLiveEvent', () => {
  it('moves the price, the minimum, the version and the bids on', () => {
    const next = applyLiveEvent(lot(), event());
    expect(next).toMatchObject({ bidSeq: 1, currentBidMinor: 105_000, minimumNextBidMinor: 110_250, serverTime: '2026-10-10T12:00:05.000Z' });
    expect(next.bids.map((b) => b.seq)).toEqual([1]);
  });

  it('ignores an event for another lot', () => {
    const view = lot();
    expect(applyLiveEvent(view, event({ lotId: 'other' }))).toBe(view);
  });

  it('never goes backwards: an older event changes nothing', () => {
    const view = applyLiveEvent(lot(), event({ bidSeq: 3, currentBidMinor: 115_000, newBids: [bid(3)] }));
    expect(applyLiveEvent(view, event({ bidSeq: 2, currentBidMinor: 110_000, newBids: [bid(2)] }))).toBe(view);
  });

  it('takes an event at the same version, which is how an extension with no new bid arrives', () => {
    const view = applyLiveEvent(lot(), event());
    const moved = applyLiveEvent(view, event({ endsAt: '2026-10-10T13:02:00.000Z', newBids: [] }));
    expect(moved.endsAt).toBe('2026-10-10T13:02:00.000Z');
    expect(moved.extended).toBe(true);
    expect(moved.bids.map((b) => b.seq)).toEqual([1]);
  });

  it('keeps `extended` once the end has moved, even if the same end arrives again', () => {
    const moved = applyLiveEvent(lot(), event({ endsAt: '2026-10-10T13:02:00.000Z' }));
    expect(applyLiveEvent(moved, event({ bidSeq: 2, endsAt: '2026-10-10T13:02:00.000Z', newBids: [bid(2)] })).extended).toBe(true);
  });

  it('lists bids once each, newest first, whatever order they arrive in, and no more than a page', () => {
    let view = lot();
    view = applyLiveEvent(view, event({ bidSeq: 2, newBids: [bid(1), bid(2)] }));
    view = applyLiveEvent(view, event({ bidSeq: 2, newBids: [bid(2)] }));
    expect(view.bids.map((b) => b.seq)).toEqual([2, 1]);

    const many = Array.from({ length: PAGE_BIDS + 5 }, (_, i) => bid(i + 1));
    const full = applyLiveEvent(lot(), event({ bidSeq: PAGE_BIDS + 5, newBids: many }));
    expect(full.bids).toHaveLength(PAGE_BIDS);
    expect(full.bids[0]?.seq).toBe(PAGE_BIDS + 5);
  });

  it('closes the lot with its outcome, and a closed lot is never reopened by a late open event', () => {
    const closed = applyLiveEvent(applyLiveEvent(lot(), event()), event({ state: 'CLOSED', minimumNextBidMinor: null, newBids: [], outcome: { kind: 'SOLD', topBidderAlias: 'Bidder 1', finalMinor: 105_000 } }));
    expect(closed).toMatchObject({ phase: 'CLOSED', minimumNextBidMinor: null, outcome: { kind: 'SOLD', finalMinor: 105_000 } });
    expect(applyLiveEvent(closed, event())).toBe(closed);
  });

  it('opens an upcoming lot on its first event', () => {
    expect(applyLiveEvent(lot({ phase: 'UPCOMING' }), event()).phase).toBe('OPEN');
  });

  it('never turns an open lot back into an upcoming one', () => {
    const open = lot();
    expect(applyLiveEvent(open, event({ bidSeq: 0, state: 'UPCOMING', newBids: [] }))).toBe(open);
  });
});

describe('eventFromAccepted', () => {
  const lotState = { lotId: 'lot-1', currentBidMinor: 110_250, bidSeq: 2, minimumNextBidMinor: 115_763, endsAt: '2026-10-10T13:00:00.000Z' };

  it('is the lot’s state after the request, with the bid it placed and no more than the fields a page uses', () => {
    const placed = { ...bid(2, 'Bidder 1'), id: 'b2', lotId: 'lot-1' };
    expect(eventFromAccepted({ bid: placed, autoBid: null, lot: lotState })).toEqual({
      lotId: 'lot-1',
      state: 'OPEN',
      bidSeq: 2,
      currentBidMinor: 110_250,
      minimumNextBidMinor: 115_763,
      endsAt: '2026-10-10T13:00:00.000Z',
      serverTime: placed.acceptedAt,
      newBids: [bid(2, 'Bidder 1')],
    });
  });

  it('carries the system’s answer too, oldest first, and takes the later bid’s time', () => {
    const mine = bid(2, 'Bidder 1');
    const answer = { ...bid(3, 'Bidder 2', 115_763, 'PROXY_AUTO'), acceptedAt: '2026-10-10T12:00:01.000Z' };
    const event = eventFromAccepted({ bid: mine, autoBid: answer, lot: { ...lotState, bidSeq: 3, currentBidMinor: 115_763 } });
    expect(event.newBids.map((b) => b.seq)).toEqual([2, 3]);
    expect(event.serverTime).toBe('2026-10-10T12:00:01.000Z');
  });

  it('moves a page on and leaves it with the leader the answer names', () => {
    const view = applyLiveEvent(lot(), eventFromAccepted({ bid: bid(1, 'Bidder 1'), autoBid: bid(2, 'Bidder 2', 110_250, 'PROXY_AUTO'), lot: { ...lotState, bidSeq: 2 } }));
    expect(standingOf('Bidder 1', true, view.bids)).toBe('outbid');
    expect(standingOf('Bidder 2', true, view.bids)).toBe('leading');
  });
});

describe('needsRefresh', () => {
  it('is false for a lot with no bids and for a page that holds the newest bid', () => {
    expect(needsRefresh({ bidSeq: 0, bids: [] })).toBe(false);
    expect(needsRefresh({ bidSeq: 4, bids: [bid(4), bid(3)] })).toBe(false);
  });

  it('is true when the lot has taken a bid the page does not list', () => {
    expect(needsRefresh({ bidSeq: 5, bids: [bid(3)] })).toBe(true);
    expect(needsRefresh({ bidSeq: 2, bids: [] })).toBe(true);
  });
});

describe('newerView', () => {
  it('prefers the higher bid version, then a closed lot, then the later server clock', () => {
    const a = lot({ bidSeq: 2 });
    const b = lot({ bidSeq: 3 });
    expect(newerView(a, b)).toBe(b);
    expect(newerView(b, a)).toBe(b);

    const open = lot({ bidSeq: 3, phase: 'OPEN' });
    const closed = lot({ bidSeq: 3, phase: 'CLOSED' });
    expect(newerView(open, closed)).toBe(closed);

    const early = lot({ bidSeq: 3, serverTime: '2026-10-10T12:00:00.000Z' });
    const late = lot({ bidSeq: 3, serverTime: '2026-10-10T12:00:04.000Z' });
    expect(newerView(early, late)).toBe(late);
    expect(newerView(late, early)).toBe(late);
  });
});

describe('standingOf', () => {
  it('is none before the viewer has bid, leading when theirs is the newest bid, and outbid when it is not', () => {
    const bids = [bid(3, 'Bidder 2'), bid(2, 'Bidder 1')];
    expect(standingOf(null, false, bids)).toBe('none');
    expect(standingOf('Bidder 2', true, bids)).toBe('leading');
    expect(standingOf('Bidder 1', true, bids)).toBe('outbid');
  });

  it('is none, not outbid, for a viewer whose alias comes from another lot of the auction', () => {
    expect(standingOf('Bidder 1', false, [bid(3, 'Bidder 2')])).toBe('none');
  });

  it('is outbid for a viewer in the contest whose bids have scrolled off the page, and for one with only a maximum', () => {
    expect(standingOf('Bidder 1', true, [bid(30, 'Bidder 2')])).toBe('outbid');
    expect(standingOf('Bidder 1', true, [])).toBe('outbid');
  });
});

describe('shownPriceMinor', () => {
  it('is the current bid, else the start price', () => {
    expect(shownPriceMinor({ currentBidMinor: null, startPriceMinor: 100_000 })).toBe(100_000);
    expect(shownPriceMinor({ currentBidMinor: 105_000, startPriceMinor: 100_000 })).toBe(105_000);
  });
});

describe('parseAmountToMinor', () => {
  it('reads whole units and a fraction, ignoring spaces and commas', () => {
    expect(parseAmountToMinor('1050')).toBe(105_000);
    expect(parseAmountToMinor('1,050')).toBe(105_000);
    expect(parseAmountToMinor(' 1 050.50 ')).toBe(105_050);
    expect(parseAmountToMinor('1050.5')).toBe(105_050);
  });

  it('rounds a float’s error away', () => {
    expect(parseAmountToMinor('1.15')).toBe(115);
    expect(parseAmountToMinor('0.29')).toBe(29);
  });

  it('refuses what is not an amount', () => {
    for (const text of ['', ' ', 'abc', '12abc', '-5', '1.234', '1..2', '.5', '1e3', '0', '0.00']) {
      expect(parseAmountToMinor(text)).toBeNull();
    }
  });

  it('refuses an amount above the API’s ceiling and takes the ceiling itself', () => {
    expect(parseAmountToMinor('10000000000000000')).toBeNull();
    expect(parseAmountToMinor(String(MAX_AMOUNT_MINOR / 100))).toBe(MAX_AMOUNT_MINOR);
  });
});

describe('amountForInput', () => {
  it('shows whole units plainly and a fraction only when there is one', () => {
    expect(amountForInput(105_000)).toBe('1050');
    expect(amountForInput(105_050)).toBe('1050.50');
  });

  it('round-trips through parseAmountToMinor', () => {
    for (const minor of [100, 105_000, 105_050, 1]) expect(parseAmountToMinor(amountForInput(minor))).toBe(minor);
  });
});

describe('describeBidFailure', () => {
  const refusal = (status: number, body: Record<string, unknown>) => new ApiError(status, String(body.message ?? 'x'), { statusCode: status, ...body });

  it('says what the minimum is when a bid is too low, and asks the page to read the lot again', () => {
    expect(describeBidFailure(refusal(409, { code: 'BID_TOO_LOW', details: { minimumNextBidMinor: 110_250 } }))).toEqual({
      key: 'bidTooLow',
      minimumNextBidMinor: 110_250,
      refresh: true,
      newKey: false,
    });
  });

  it('keeps a bidder who already leads from bidding against themselves', () => {
    expect(describeBidFailure(refusal(409, { code: 'ALREADY_LEADING', details: { minimumNextBidMinor: 110_250 } }))).toMatchObject({ key: 'alreadyLeading', refresh: false });
  });

  it('treats a lot that closed, or never opened, as closed and refreshes', () => {
    expect(describeBidFailure(refusal(409, { code: 'AUCTION_ENDED' }))).toMatchObject({ key: 'closed', refresh: true });
    expect(describeBidFailure(refusal(409, { code: 'LOT_NOT_OPEN' }))).toMatchObject({ key: 'closed', refresh: true });
  });

  it('carries the wait on a rate limit, from the body', () => {
    expect(describeBidFailure(refusal(429, { code: 'BID_RATE_LIMITED', retryAfterSeconds: 12 }))).toMatchObject({ key: 'rateLimited', retryAfterSeconds: 12 });
  });

  it('treats the shared throttle’s plain 429, which names no code, as a rate limit too', () => {
    expect(describeBidFailure(refusal(429, { message: 'Too Many Requests' }))).toMatchObject({ key: 'rateLimited' });
  });

  it('asks for a new request key only when the old one was used for another amount', () => {
    expect(describeBidFailure(refusal(409, { code: 'IDEMPOTENCY_KEY_REUSED' }))).toMatchObject({ key: 'keyReused', newKey: true });
    expect(describeBidFailure(refusal(409, { code: 'BID_TOO_LOW', details: { minimumNextBidMinor: 1 } })).newKey).toBe(false);
  });

  it('names the least a maximum may be', () => {
    expect(describeBidFailure(refusal(409, { code: 'PROXY_TOO_LOW', details: { minimumMaxMinor: 110_250 } }))).toMatchObject({ key: 'proxyTooLow', minimumMaxMinor: 110_250 });
    expect(describeBidFailure(refusal(409, { code: 'PROXY_CANNOT_LOWER' }))).toMatchObject({ key: 'proxyCannotLower' });
  });

  it('says not eligible, signed out and busy by their status or code', () => {
    expect(describeBidFailure(refusal(403, { code: 'BIDDER_NOT_ELIGIBLE' }))).toMatchObject({ key: 'notEligible' });
    expect(describeBidFailure(refusal(401, { message: 'Unauthorized' }))).toMatchObject({ key: 'signedOut' });
    expect(describeBidFailure(refusal(503, { message: 'bid was not placed' }))).toMatchObject({ key: 'busy', refresh: true });
  });

  it('carries why a person may not bid, so the page can show the right card, and drops a cause it does not know', () => {
    for (const why of ['RUNS_AUCTION', 'NOT_REGISTERED', 'PENDING', 'DECLINED', 'SUSPENDED']) {
      expect(describeBidFailure(refusal(403, { code: 'BIDDER_NOT_ELIGIBLE', details: { why } }))).toMatchObject({ key: 'notEligible', why });
    }
    expect(describeBidFailure(refusal(403, { code: 'BIDDER_NOT_ELIGIBLE', details: { why: 'BANNED' } })).why).toBeUndefined();
    expect(describeBidFailure(refusal(403, { code: 'BIDDER_NOT_ELIGIBLE' })).why).toBeUndefined();
  });

  it('calls anything else, including a request that never arrived, a network failure, and never asks for a new key', () => {
    expect(describeBidFailure(new TypeError('Failed to fetch'))).toEqual({ key: 'network', refresh: false, newKey: false });
    expect(describeBidFailure(refusal(500, { message: 'boom' }))).toMatchObject({ key: 'network', newKey: false });
  });

  it('ignores a detail that is not a number', () => {
    expect(describeBidFailure(refusal(409, { code: 'BID_TOO_LOW', details: { minimumNextBidMinor: 'lots' } })).minimumNextBidMinor).toBeUndefined();
  });
});

describe('spread', () => {
  it('stays within 20 % either side of the wait, at both ends of the random range', () => {
    expect(spread(20_000, () => 0)).toBe(16_000);
    expect(spread(20_000, () => 0.5)).toBe(20_000);
    expect(spread(20_000, () => 0.999999)).toBe(24_000);
  });

  it('never leaves the 16 000 to 24 000 band over a thousand real draws', () => {
    for (let draw = 0; draw < 1_000; draw += 1) {
      const wait = spread(20_000);
      expect(wait).toBeGreaterThanOrEqual(16_000);
      expect(wait).toBeLessThanOrEqual(24_000);
    }
  });
});
