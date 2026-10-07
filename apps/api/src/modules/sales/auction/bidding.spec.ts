import { toMinor } from '@newax/shared';
import { chainHash, verifyChain } from '../../../core/common/hash-chain';
import {
  DEFAULT_BID_RULES,
  MAX_PRICE_MINOR,
  type BidRules,
  type ProxyOffer,
  antiSnipeExtensionMs,
  bidCanonical,
  bidderAlias,
  computeIncrement,
  lotOutcome,
  minimumNextBid,
  parseBidRules,
  resolveProxy,
} from './bidding';

/** Spelled out, not read from the brand, so the arithmetic below holds for any currency. */
const rules: BidRules = {
  incrementBps: 500,
  minStepMinor: 100,
  antiSnipeWindowMs: 120_000,
  antiSnipeExtendMs: 120_000,
  maxExtensionMs: 1_800_000,
  buyerPremiumBps: 0,
  paymentWindowMs: 72 * 3_600_000,
};

describe('default rules', () => {
  it('are 5% with one whole currency unit as the smallest step, whatever the brand currency', () => {
    expect(DEFAULT_BID_RULES).toEqual({ ...rules, minStepMinor: toMinor(1) });
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
    expect(computeIncrement(2_001, { ...rules, minStepMinor: 1 })).toBe(101); // 100.05
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
    const stored = { incrementBps: 1_000, minStepMinor: 500, antiSnipeWindowMs: 60_000, antiSnipeExtendMs: 30_000, maxExtensionMs: 600_000, buyerPremiumBps: 1_000, paymentWindowMs: 48 * 3_600_000 };
    expect(parseBidRules(stored)).toEqual(stored);
  });

  it('falls back to the defaults for a missing snapshot', () => {
    expect(parseBidRules(null)).toEqual(DEFAULT_BID_RULES);
    expect(parseBidRules(undefined)).toEqual(DEFAULT_BID_RULES);
    expect(parseBidRules('x')).toEqual(DEFAULT_BID_RULES);
  });

  it('keeps the field it can trust and defaults the one it cannot', () => {
    expect(parseBidRules({ incrementBps: 250, minStepMinor: -5 })).toEqual({ ...DEFAULT_BID_RULES, incrementBps: 250 });
    expect(parseBidRules({ incrementBps: 0.5, minStepMinor: 700 })).toEqual({ ...DEFAULT_BID_RULES, minStepMinor: 700 });
    expect(parseBidRules({ incrementBps: 20_000, minStepMinor: 700 })).toEqual({ ...DEFAULT_BID_RULES, minStepMinor: 700 });
  });

  it('reads a snapshot written before anti-snipe existed, with the anti-snipe defaults', () => {
    expect(parseBidRules({ incrementBps: 1_000, minStepMinor: 500 })).toEqual({ ...DEFAULT_BID_RULES, incrementBps: 1_000, minStepMinor: 500 });
  });

  it('accepts zero for the anti-snipe fields, which switches it off, but never a negative', () => {
    expect(parseBidRules({ antiSnipeExtendMs: 0 }).antiSnipeExtendMs).toBe(0);
    expect(parseBidRules({ antiSnipeExtendMs: -1 }).antiSnipeExtendMs).toBe(DEFAULT_BID_RULES.antiSnipeExtendMs);
    expect(parseBidRules({ maxExtensionMs: 365 * 24 * 3_600_000 }).maxExtensionMs).toBe(DEFAULT_BID_RULES.maxExtensionMs);
  });

  it('reads a snapshot written before settlement existed as no premium and a 72-hour window', () => {
    const before = parseBidRules({ incrementBps: 1_000, minStepMinor: 500, antiSnipeWindowMs: 60_000, antiSnipeExtendMs: 30_000, maxExtensionMs: 600_000 });
    expect(before.buyerPremiumBps).toBe(0);
    expect(before.paymentWindowMs).toBe(72 * 3_600_000);
  });

  it('accepts no premium but not a negative one or one above half the price, and keeps the window between an hour and thirty days', () => {
    expect(parseBidRules({ buyerPremiumBps: 0 }).buyerPremiumBps).toBe(0);
    expect(parseBidRules({ buyerPremiumBps: 5_000 }).buyerPremiumBps).toBe(5_000);
    expect(parseBidRules({ buyerPremiumBps: 5_001 }).buyerPremiumBps).toBe(0);
    expect(parseBidRules({ buyerPremiumBps: -1 }).buyerPremiumBps).toBe(0);
    expect(parseBidRules({ paymentWindowMs: 3_600_000 }).paymentWindowMs).toBe(3_600_000);
    expect(parseBidRules({ paymentWindowMs: 3_599_999 }).paymentWindowMs).toBe(72 * 3_600_000);
    expect(parseBidRules({ paymentWindowMs: 31 * 24 * 3_600_000 }).paymentWindowMs).toBe(72 * 3_600_000);
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

describe('antiSnipeExtensionMs', () => {
  const end = new Date('2026-10-10T12:00:00.000Z');
  const at = (msBeforeEnd: number) => new Date(end.getTime() - msBeforeEnd);

  it('extends nothing for a bid before the closing window', () => {
    expect(antiSnipeExtensionMs(end, at(120_001), 0, rules)).toBe(0);
    expect(antiSnipeExtensionMs(end, at(3_600_000), 0, rules)).toBe(0);
  });

  it('extends for a bid exactly at the edge of the window, and for one in it', () => {
    expect(antiSnipeExtensionMs(end, at(120_000), 0, rules)).toBe(120_000);
    expect(antiSnipeExtensionMs(end, at(1), 0, rules)).toBe(120_000);
  });

  it('cuts the last extension to what is left of the cap', () => {
    expect(antiSnipeExtensionMs(end, at(10), 1_700_000, rules)).toBe(100_000);
  });

  it('extends nothing once the cap is used up', () => {
    expect(antiSnipeExtensionMs(end, at(10), 1_800_000, rules)).toBe(0);
    expect(antiSnipeExtensionMs(end, at(10), 2_000_000, rules)).toBe(0);
  });

  it('extends nothing when the extension is zero, whatever the window', () => {
    expect(antiSnipeExtensionMs(end, at(10), 0, { ...rules, antiSnipeExtendMs: 0 })).toBe(0);
  });

  it('is the cap itself, no more, over a run of bids each in the window', () => {
    let used = 0;
    let bids = 0;
    for (;;) {
      const add = antiSnipeExtensionMs(end, at(1), used, rules);
      if (add === 0) break;
      used += add;
      bids += 1;
    }
    expect(used).toBe(1_800_000);
    expect(bids).toBe(15);
  });
});

describe('resolveProxy', () => {
  const offer = (bidderId: string, maxMinor: number, placedAfterSeq = 0): ProxyOffer => ({ bidderId, maxMinor, placedAfterSeq });
  const START = 10_000;
  const resolve = (standing: { bidderId: string; amountMinor: number; seq: number } | null, proxies: ProxyOffer[]) =>
    resolveProxy({ standing, startPriceMinor: START, proxies, rules });

  it('places nothing when nobody has a proxy', () => {
    expect(resolve(null, [])).toBeNull();
    expect(resolve({ bidderId: 'a', amountMinor: 20_000, seq: 1 }, [])).toBeNull();
  });

  it('opens a lone proxy at the opening price', () => {
    expect(resolve(null, [offer('a', 50_000)])).toEqual({ bidderId: 'a', amountMinor: START });
  });

  it('does not open a lot with a proxy below the opening price', () => {
    expect(resolve(null, [offer('a', START - 1)])).toBeNull();
  });

  it('answers a manual bid beaten by a higher proxy with the bid plus one increment', () => {
    // b bids 20 000 by hand; a's proxy of 100 000 answers at 20 000 + 5%.
    expect(resolve({ bidderId: 'b', amountMinor: 20_000, seq: 1 }, [offer('a', 100_000)])).toEqual({ bidderId: 'a', amountMinor: 21_000 });
  });

  it('leaves a manual bid that is above the proxy standing', () => {
    expect(resolve({ bidderId: 'b', amountMinor: 120_000, seq: 1 }, [offer('a', 100_000)])).toBeNull();
  });

  it('puts the proxy leader at the runner-up proxy plus one increment: 100 against 80 stands at 84', () => {
    const a = offer('a', 100_000, 0);
    const b = offer('b', 80_000, 0);
    // Both in, 100_000 vs 80_000: the higher one stands at 80_000 + 5% = 84_000.
    expect(resolve({ bidderId: 'b', amountMinor: START, seq: 1 }, [a, b])).toEqual({ bidderId: 'a', amountMinor: 84_000 });
  });

  it('caps the price at the leader\'s own maximum', () => {
    // 100_000 against 98_000: 98_000 + 5% = 102_900 is past 100_000, so the leader stands at 100_000.
    const a = offer('a', 100_000);
    const b = offer('b', 98_000);
    expect(resolve({ bidderId: 'b', amountMinor: START, seq: 1 }, [a, b])).toEqual({ bidderId: 'a', amountMinor: 100_000 });
  });

  it('gives equal maxima to the earlier one, at that maximum', () => {
    const early = offer('early', 50_000, 0);
    const late = offer('late', 50_000, 3);
    expect(resolve({ bidderId: 'late', amountMinor: 30_000, seq: 4 }, [late, early])).toEqual({ bidderId: 'early', amountMinor: 50_000 });
  });

  it('keeps an already-leading bidder in front when their price only needs to rise', () => {
    const a = offer('a', 100_000, 0);
    const b = offer('b', 80_000, 0);
    // a leads at 50_000 and b has just raised their proxy to 80_000: a rises to 84_000.
    expect(resolve({ bidderId: 'a', amountMinor: 50_000, seq: 5 }, [a, b])).toEqual({ bidderId: 'a', amountMinor: 84_000 });
  });

  it('places nothing when the leader already stands at the price the competition calls for', () => {
    expect(resolve({ bidderId: 'a', amountMinor: 84_000, seq: 6 }, [offer('a', 100_000), offer('b', 80_000)])).toBeNull();
  });

  it('treats a manual bid above a bidder\'s own proxy as that bidder\'s ceiling', () => {
    // a has a proxy of 30_000 but bid 60_000 by hand: their ceiling is 60_000, so b's 50_000 proxy loses.
    const result = resolve({ bidderId: 'a', amountMinor: 60_000, seq: 4 }, [offer('a', 30_000), offer('b', 50_000)]);
    expect(result).toBeNull();
  });

  it('is one bid, however far apart the maxima are', () => {
    const result = resolve({ bidderId: 'b', amountMinor: START, seq: 1 }, [offer('a', 1_000_000_000), offer('b', 10_000_000)]);
    expect(result).toEqual({ bidderId: 'a', amountMinor: 10_500_000 });
  });
});

describe('lotOutcome', () => {
  it('has no winner and no met reserve for a lot nobody bid on', () => {
    expect(lotOutcome({ currentBidMinor: null, leaderBidderId: null, reservePriceMinor: 5_000 })).toEqual({
      topBidderId: null,
      topBidMinor: null,
      reserveMet: false,
    });
    expect(lotOutcome({ currentBidMinor: null, leaderBidderId: null, reservePriceMinor: null }).reserveMet).toBe(false);
  });

  it('meets a reserve the top bid reaches, exactly or beyond', () => {
    expect(lotOutcome({ currentBidMinor: 5_000, leaderBidderId: 'a', reservePriceMinor: 5_000 })).toEqual({
      topBidderId: 'a',
      topBidMinor: 5_000,
      reserveMet: true,
    });
    expect(lotOutcome({ currentBidMinor: 5_001, leaderBidderId: 'a', reservePriceMinor: 5_000 }).reserveMet).toBe(true);
  });

  it('keeps the top bidder but does not meet a reserve the top bid falls short of', () => {
    expect(lotOutcome({ currentBidMinor: 4_999, leaderBidderId: 'a', reservePriceMinor: 5_000 })).toEqual({
      topBidderId: 'a',
      topBidMinor: 4_999,
      reserveMet: false,
    });
  });

  it('counts any bid as meeting a lot with no reserve', () => {
    expect(lotOutcome({ currentBidMinor: 1, leaderBidderId: 'a', reservePriceMinor: null }).reserveMet).toBe(true);
  });
});
