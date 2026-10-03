import { MAX_EVENT_BIDS, eventForAcceptedBids, mergeLiveEvents, type LiveBid, type LotLiveEvent } from './lot-live';

const bid = (seq: number, over: Partial<LiveBid> = {}): LiveBid => ({
  seq,
  alias: `Bidder ${seq}`,
  amountMinor: 100_000 + seq * 5_000,
  kind: 'MANUAL',
  acceptedAt: '2026-10-10T12:00:00.000Z',
  ...over,
});

const event = (bidSeq: number, over: Partial<LotLiveEvent> = {}): LotLiveEvent => ({
  lotId: 'l1',
  state: 'OPEN',
  bidSeq,
  currentBidMinor: 100_000 + bidSeq * 5_000,
  minimumNextBidMinor: 105_000 + bidSeq * 5_000,
  endsAt: '2026-10-10T12:30:00.000Z',
  serverTime: '2026-10-10T12:00:00.000Z',
  newBids: [bid(bidSeq)],
  ...over,
});

describe('mergeLiveEvents', () => {
  it('takes the newer event’s state and keeps the bids of both, oldest first', () => {
    const merged = mergeLiveEvents(event(3), event(5, { newBids: [bid(4), bid(5)] }));
    expect(merged).toMatchObject({ bidSeq: 5, currentBidMinor: 125_000, minimumNextBidMinor: 130_000 });
    expect(merged.newBids.map((b) => b.seq)).toEqual([3, 4, 5]);
  });

  it('lists a bid once however many events carried it', () => {
    const merged = mergeLiveEvents(event(4, { newBids: [bid(3), bid(4)] }), event(5, { newBids: [bid(4), bid(5)] }));
    expect(merged.newBids.map((b) => b.seq)).toEqual([3, 4, 5]);
  });

  it('never lets a message that overtook a newer one put the lot back', () => {
    const merged = mergeLiveEvents(event(6), event(5));
    expect(merged.bidSeq).toBe(6);
    expect(merged.currentBidMinor).toBe(130_000);
    expect(merged.newBids.map((b) => b.seq)).toEqual([5, 6]);
  });

  it('lets a close at the same version win over the last bid, and an open never undo a close', () => {
    const closed = event(5, { state: 'CLOSED', minimumNextBidMinor: null, newBids: [], outcome: { kind: 'NOT_SOLD', reason: 'RESERVE_NOT_MET' } });
    expect(mergeLiveEvents(event(5), closed)).toMatchObject({ state: 'CLOSED', outcome: { kind: 'NOT_SOLD' } });
    expect(mergeLiveEvents(closed, event(5)).state).toBe('CLOSED');
  });

  it('lets an open at the same version win over an upcoming one, and an upcoming one never undo an open', () => {
    const upcoming = event(0, { state: 'UPCOMING', currentBidMinor: null, newBids: [] });
    const open = event(0, { newBids: [] });
    expect(mergeLiveEvents(upcoming, open).state).toBe('OPEN');
    expect(mergeLiveEvents(open, upcoming).state).toBe('OPEN');
  });

  it('takes the later end for an extension at the same version', () => {
    const extended = event(5, { newBids: [], endsAt: '2026-10-10T12:32:00.000Z' });
    expect(mergeLiveEvents(event(5), extended).endsAt).toBe('2026-10-10T12:32:00.000Z');
  });

  it('keeps only the latest bids of a long burst', () => {
    const burst = Array.from({ length: MAX_EVENT_BIDS + 10 }, (_, index) => bid(index + 1));
    const merged = mergeLiveEvents(event(1), event(MAX_EVENT_BIDS + 10, { newBids: burst }));
    expect(merged.newBids).toHaveLength(MAX_EVENT_BIDS);
    expect(merged.newBids[0]!.seq).toBe(11);
    expect(merged.newBids[MAX_EVENT_BIDS - 1]!.seq).toBe(MAX_EVENT_BIDS + 10);
  });
});

describe('eventForAcceptedBids', () => {
  const at = new Date('2026-10-10T12:00:01.500Z');
  const lot = { lotId: 'l1', bidSeq: 7, currentBidMinor: 150_000, minimumNextBidMinor: 157_500, endsAt: new Date('2026-10-10T12:32:00.000Z') };

  it('says the lot is open at its new price, with the bids written and the clock they were accepted by', () => {
    const result = eventForAcceptedBids(lot, [
      { seq: 6, alias: 'Bidder 2', amountMinor: 145_000, kind: 'MANUAL', acceptedAt: at },
      { seq: 7, alias: 'Bidder 9', amountMinor: 150_000, kind: 'PROXY_AUTO', acceptedAt: at },
    ]);
    expect(result).toEqual({
      lotId: 'l1',
      state: 'OPEN',
      bidSeq: 7,
      currentBidMinor: 150_000,
      minimumNextBidMinor: 157_500,
      endsAt: '2026-10-10T12:32:00.000Z',
      serverTime: '2026-10-10T12:00:01.500Z',
      newBids: [
        { seq: 6, alias: 'Bidder 2', amountMinor: 145_000, kind: 'MANUAL', acceptedAt: '2026-10-10T12:00:01.500Z' },
        { seq: 7, alias: 'Bidder 9', amountMinor: 150_000, kind: 'PROXY_AUTO', acceptedAt: '2026-10-10T12:00:01.500Z' },
      ],
    });
  });

  it('carries no name, account or reserve — only what a lot page already shows', () => {
    const json = JSON.stringify(eventForAcceptedBids(lot, [{ seq: 7, alias: 'Bidder 1', amountMinor: 150_000, kind: 'MANUAL', acceptedAt: at }]));
    expect(json).not.toMatch(/userId|bidderId|reserve|idempotency|hash/i);
  });
});
