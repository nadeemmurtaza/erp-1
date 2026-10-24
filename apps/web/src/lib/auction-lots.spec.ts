import { describe, expect, it } from 'vitest';
import { auctionClosesAt, describeExtension, describeOutcome, lotEndsAt } from './auction-lots';

const AUCTION_END = '2026-10-10T12:00:00.000Z';
const lot = (over: Partial<{ status: string; endsAt: string | null; extendedMs: number }> = {}) => ({ status: 'OPEN', endsAt: null, extendedMs: 0, ...over });

describe('lotEndsAt', () => {
  it('is the auction’s end until the lot has its own', () => {
    expect(lotEndsAt(lot(), AUCTION_END)).toBe(AUCTION_END);
    expect(lotEndsAt(lot({ endsAt: '2026-10-10T12:02:00.000Z' }), AUCTION_END)).toBe('2026-10-10T12:02:00.000Z');
  });
});

describe('auctionClosesAt', () => {
  it('is the auction’s end when no lot has moved', () => {
    expect(auctionClosesAt([lot(), lot()], AUCTION_END)).toBe(AUCTION_END);
  });

  it('is the latest end among open lots, so an extended lot keeps the auction open', () => {
    const lots = [lot({ endsAt: '2026-10-10T12:04:00.000Z' }), lot({ endsAt: '2026-10-10T12:02:00.000Z' }), lot()];
    expect(auctionClosesAt(lots, AUCTION_END)).toBe('2026-10-10T12:04:00.000Z');
  });

  it('ignores lots that are closed or withdrawn, even if they ran later', () => {
    const lots = [lot({ status: 'CLOSED', endsAt: '2026-10-10T13:00:00.000Z' }), lot({ status: 'WITHDRAWN', endsAt: '2026-10-10T14:00:00.000Z' }), lot()];
    expect(auctionClosesAt(lots, AUCTION_END)).toBe(AUCTION_END);
  });

  it('is the auction’s end once nothing is open', () => {
    expect(auctionClosesAt([lot({ status: 'CLOSED' })], AUCTION_END)).toBe(AUCTION_END);
    expect(auctionClosesAt([], AUCTION_END)).toBe(AUCTION_END);
  });

  it('can be earlier than the auction’s end when every open lot ended sooner', () => {
    expect(auctionClosesAt([lot({ endsAt: '2026-10-10T11:00:00.000Z' })], AUCTION_END)).toBe('2026-10-10T11:00:00.000Z');
  });
});

describe('describeExtension', () => {
  it('says nothing for a lot that has not been extended', () => {
    expect(describeExtension(0)).toBeNull();
  });

  it('reads whole minutes, rounding a part-minute up', () => {
    expect(describeExtension(120_000)).toBe('extended 2 min');
    expect(describeExtension(1_800_000)).toBe('extended 30 min');
    expect(describeExtension(30_000)).toBe('extended 1 min');
  });
});

describe('describeOutcome', () => {
  const money = (minor: number) => `Rs ${minor / 100}`;

  it('names the winner and the price', () => {
    expect(describeOutcome({ topBidderAlias: 'Bidder 3', topBidMinor: 12_000, reserveMet: true, bidCount: 4 }, money)).toEqual({
      text: 'Bidder 3 · Rs 120',
      reserveNotMet: false,
    });
  });

  it('says so when nobody bid', () => {
    expect(describeOutcome({ topBidderAlias: null, topBidMinor: null, reserveMet: false, bidCount: 0 }, money)).toEqual({ text: 'No bids', reserveNotMet: false });
  });

  it('flags a reserve that was not met, and says nothing about it to a viewer who may not see it', () => {
    expect(describeOutcome({ topBidderAlias: 'Bidder 1', topBidMinor: 2_000, reserveMet: false, bidCount: 1 }, money).reserveNotMet).toBe(true);
    expect(describeOutcome({ topBidderAlias: 'Bidder 1', topBidMinor: 2_000, bidCount: 1 }, money).reserveNotMet).toBe(false);
  });
});
