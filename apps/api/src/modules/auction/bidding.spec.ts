import { toMinor } from '@newax/shared';
import { chainHash, verifyChain } from '../../core/common/hash-chain';
import {
  DEFAULT_BID_RULES,
  MAX_PRICE_MINOR,
  bidCanonical,
  bidderAlias,
  computeIncrement,
  minimumNextBid,
  parseBidRules,
} from './bidding';

/** Spelled out, not read from the brand, so the arithmetic below holds for any currency. */
const rules = { incrementBps: 500, minStepMinor: 100 };

describe('default rules', () => {
  it('are 5% with one whole currency unit as the smallest step, whatever the brand currency', () => {
    expect(DEFAULT_BID_RULES).toEqual({ incrementBps: 500, minStepMinor: toMinor(1) });
  });
});

describe('computeIncrement', () => {
  it('is 5% of the current bid when that is above the smallest step', () => {
    expect(computeIncrement(100_000, rules)).toBe(5_000);
  });

  it('is the smallest step when 5% would be smaller', () => {
    expect(computeIncrement(1_000, rules)).toBe(100); // 5% = 50
    expect(computeIncrement(1, rules)).toBe(100);
  });

  it('rounds the percentage up, never down', () => {
    expect(computeIncrement(2_001, { incrementBps: 500, minStepMinor: 1 })).toBe(101); // 100.05
  });

  it('stays exact at the price ceiling, where a double would not', () => {
    expect(computeIncrement(MAX_PRICE_MINOR, rules)).toBe(50_000_000_000_000);
    expect(minimumNextBid(MAX_PRICE_MINOR, 1, rules)).toBe(1_050_000_000_000_000);
  });

  it('takes about fourteen 5% raises to double a price', () => {
    let price = 100_000;
    let raises = 0;
    while (price < 200_000) {
      price = minimumNextBid(price, 100_000, rules);
      raises += 1;
    }
    expect(raises).toBe(15); // 1.05^14 = 1.98, 1.05^15 = 2.08
  });
});

describe('minimumNextBid', () => {
  it('lets the first bid equal the opening price', () => {
    expect(minimumNextBid(null, 50_000, rules)).toBe(50_000);
  });

  it('asks for the current bid plus the increment after that', () => {
    expect(minimumNextBid(50_000, 50_000, rules)).toBe(52_500);
  });
});

describe('parseBidRules', () => {
  it('reads a stored snapshot', () => {
    expect(parseBidRules({ incrementBps: 1_000, minStepMinor: 500 })).toEqual({ incrementBps: 1_000, minStepMinor: 500 });
  });

  it('falls back to the defaults for a missing snapshot', () => {
    expect(parseBidRules(null)).toEqual(DEFAULT_BID_RULES);
    expect(parseBidRules(undefined)).toEqual(DEFAULT_BID_RULES);
    expect(parseBidRules('x')).toEqual(DEFAULT_BID_RULES);
  });

  it('keeps the field it can trust and defaults the one it cannot', () => {
    expect(parseBidRules({ incrementBps: 250, minStepMinor: -5 })).toEqual({ incrementBps: 250, minStepMinor: DEFAULT_BID_RULES.minStepMinor });
    expect(parseBidRules({ incrementBps: 0.5, minStepMinor: 700 })).toEqual({ incrementBps: 500, minStepMinor: 700 });
    expect(parseBidRules({ incrementBps: 20_000, minStepMinor: 700 })).toEqual({ incrementBps: 500, minStepMinor: 700 });
  });
});

describe('bid canonical form', () => {
  const bid = {
    id: 'b1',
    lotId: 'l1',
    seq: 2,
    bidderId: 'p1',
    amountMinor: 52_500,
    kind: 'MANUAL',
    acceptedAt: new Date('2026-10-02T12:00:00.123Z'),
    idempotencyKey: 'k-1',
  };

  it('is fixed-order text with the amount as a string and the time as an instant', () => {
    expect(bidCanonical(bid)).toBe('["b1","l1",2,"p1","52500","MANUAL","2026-10-02T12:00:00.123Z","k-1"]');
  });

  it('hashes a bigint amount the same as the number it came from', () => {
    expect(bidCanonical({ ...bid, amountMinor: 52_500n })).toBe(bidCanonical(bid));
  });

  it('changes when any field changes, so an edited bid cannot keep its hash', () => {
    const base = chainHash(null, bidCanonical(bid));
    for (const edit of [
      { amountMinor: 52_501 },
      { bidderId: 'p2' },
      { seq: 3 },
      { acceptedAt: new Date('2026-10-02T12:00:00.124Z') },
      { idempotencyKey: 'k-2' },
    ]) {
      expect(chainHash(null, bidCanonical({ ...bid, ...edit }))).not.toBe(base);
    }
  });

  it('chains two bids so that editing the first breaks the second', () => {
    const first = { ...bid, seq: 1, id: 'b1' };
    const second = { ...bid, seq: 2, id: 'b2' };
    const h1 = chainHash(null, bidCanonical(first));
    const h2 = chainHash(h1, bidCanonical(second));
    const links = [
      { prevHash: null, hash: h1, canonical: bidCanonical({ ...first, amountMinor: 1 }) },
      { prevHash: h1, hash: h2, canonical: bidCanonical(second) },
    ];
    expect(verifyChain(links)).toEqual({ valid: false, brokenAt: 0, reason: 'hash-mismatch' });
  });
});

describe('bidderAlias', () => {
  it('numbers bidders for the life of one auction', () => {
    expect(bidderAlias(7)).toBe('Bidder 7');
  });
});
