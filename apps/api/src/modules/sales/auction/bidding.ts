import { toMinor } from '@newax/shared';
import { canonicalize } from '../../../core/common/hash-chain';

/**
 * The pure half of bidding (launchpad-apps/234-auction-app.md §5, §12): what a
 * next bid must be at least, and the text a bid is chained by. No database, no
 * clock, so a "simulate this auction on past bids" preview (§15, dry run) can
 * call the same functions `placeBid()` does and cannot drift from it.
 */

/**
 * The largest price or bid, in minor units: 10^15, which is ten trillion in a
 * two-decimal currency. It is the biggest round number whose five-percent step
 * and the sum with it stay below `Number.MAX_SAFE_INTEGER` (9.007 × 10^15), so
 * every comparison the service makes is exact. A larger lot needs the money
 * columns to move to a string or decimal type everywhere, not here alone.
 */
export const MAX_PRICE_MINOR = 1_000_000_000_000_000;

/** A type alias, not an interface, so it can be stored as the auction's JSON column as it is. */
export type BidRules = {
  /** Basis points of the current bid a raise must add: 500 is 5%. */
  incrementBps: number;
  /** The least a raise may add, in minor units. */
  minStepMinor: number;
  /** A bid this close to a lot's end, or closer, moves the end (doc 234 §5.4), in milliseconds. */
  antiSnipeWindowMs: number;
  /** How far a bid inside the window moves the end. 0 switches anti-snipe off. */
  antiSnipeExtendMs: number;
  /** The most anti-snipe may add to one lot in total, so a bidding war ends. */
  maxExtensionMs: number;
  /** The buyer's premium, in basis points of the winning bid: 1 000 is 10%. 0 means none (doc 234 §9). */
  buyerPremiumBps: number;
  /** How long a winner has to pay before the win lapses, in milliseconds (doc 234 §12). */
  paymentWindowMs: number;
};

/**
 * What an auction falls back to when its frozen rules are missing or malformed
 * (doc 234 §12, "rule missing → 5%"). 5% takes about 15 raises to double a
 * price, which keeps a contest moving without penny-bids; one whole currency
 * unit (`toMinor(1)`, so it follows the brand's currency) is the smallest step
 * a person would call a raise.
 */
export const DEFAULT_BID_RULES: BidRules = {
  incrementBps: 500,
  minStepMinor: toMinor(1),
  // Two minutes is long enough for a person to read "you were outbid" and answer,
  // and short enough that a lot does not run on; thirty minutes bounds a war so
  // staff and sellers can plan around it (doc 234 §12).
  antiSnipeWindowMs: 120_000,
  antiSnipeExtendMs: 120_000,
  maxExtensionMs: 1_800_000,
  // No premium unless the shop sets one: an auction that was scheduled before the
  // premium existed was shown to its bidders without one, and must stay that way.
  buyerPremiumBps: 0,
  // 72 hours covers a weekend bank transfer; shorter penalises honest buyers, longer
  // ties the lot up (doc 234 §12).
  paymentWindowMs: 72 * 3_600_000,
};

const MAX_DURATION_MS = 7 * 24 * 3_600_000;
/** A premium above half the price is a typo, not a policy. */
export const MAX_PREMIUM_BPS = 5_000;
export const MIN_PAYMENT_WINDOW_MS = 3_600_000;
export const MAX_PAYMENT_WINDOW_MS = 30 * 24 * 3_600_000;

const isCount = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Reads the `Auction.bidRules` JSON, taking each field it can trust and the default for the rest. */
export function parseBidRules(raw: unknown): BidRules {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const pick = <K extends keyof BidRules>(key: K, min: number, max: number): number =>
    isCount(source[key], min, max) ? (source[key] as number) : DEFAULT_BID_RULES[key];
  return {
    incrementBps: pick('incrementBps', 1, 10_000),
    minStepMinor: pick('minStepMinor', 1, MAX_PRICE_MINOR),
    antiSnipeWindowMs: pick('antiSnipeWindowMs', 0, MAX_DURATION_MS),
    antiSnipeExtendMs: pick('antiSnipeExtendMs', 0, MAX_DURATION_MS),
    maxExtensionMs: pick('maxExtensionMs', 0, MAX_DURATION_MS),
    buyerPremiumBps: pick('buyerPremiumBps', 0, MAX_PREMIUM_BPS),
    paymentWindowMs: pick('paymentWindowMs', MIN_PAYMENT_WINDOW_MS, MAX_PAYMENT_WINDOW_MS),
  };
}

/**
 * The greater of `incrementBps` of the current bid, rounded up, and the
 * smallest step. Done in BigInt because 10^15 × 10^4 overflows the 2^53 a
 * double holds exactly.
 */
export function computeIncrement(currentMinor: number, rules: BidRules): number {
  const percent = (BigInt(currentMinor) * BigInt(rules.incrementBps) + 9_999n) / 10_000n;
  return Math.max(Number(percent), rules.minStepMinor);
}

/** The first bid may equal the opening price; every later one must clear the current bid by the increment. */
export function minimumNextBid(currentMinor: number | null, startPriceMinor: number, rules: BidRules): number {
  return currentMinor === null ? startPriceMinor : currentMinor + computeIncrement(currentMinor, rules);
}

/** The label a bidder carries for the life of one auction: "Bidder 7". */
export const bidderAlias = (ordinal: number): string => `Bidder ${ordinal}`;

export interface ChainedBidFields {
  id: string;
  lotId: string;
  seq: number;
  bidderId: string;
  amountMinor: number | bigint;
  kind: string;
  acceptedAt: Date;
  idempotencyKey: string;
}

/**
 * The text a bid is hashed by, in a fixed field order. Amounts go in as
 * strings and the time as an ISO instant, so a value read back from the
 * database hashes the same as the one the writer held.
 */
export function bidCanonical(bid: ChainedBidFields): string {
  return canonicalize([
    bid.id,
    bid.lotId,
    bid.seq,
    bid.bidderId,
    bid.amountMinor.toString(),
    bid.kind,
    bid.acceptedAt.toISOString(),
    bid.idempotencyKey,
  ]);
}

/**
 * How far a bid accepted at `acceptedAt` moves a lot's end (doc 234 §5.4): the
 * extension if it landed in the closing window, cut to what is left of the cap,
 * else nothing. A bid exactly `antiSnipeWindowMs` before the end is inside the
 * window; a bid at or after the end is never accepted, so it never reaches here.
 */
export function antiSnipeExtensionMs(effectiveEnd: Date, acceptedAt: Date, usedMs: number, rules: BidRules): number {
  if (rules.antiSnipeExtendMs <= 0) return 0;
  if (acceptedAt.getTime() < effectiveEnd.getTime() - rules.antiSnipeWindowMs) return 0;
  return Math.max(0, Math.min(rules.antiSnipeExtendMs, rules.maxExtensionMs - usedMs));
}

/** One bidder's standing maximum, already decrypted. `placedAfterSeq` is the lot's `bidSeq` when it was placed. */
export interface ProxyOffer {
  bidderId: string;
  maxMinor: number;
  placedAfterSeq: number;
}

/** The latest accepted bid on the lot: its holder has offered that much and leads at it. */
export interface StandingBid {
  bidderId: string;
  amountMinor: number;
  seq: number;
}

export interface ProxyBidToPlace {
  bidderId: string;
  amountMinor: number;
}

/**
 * What the system should bid on someone's behalf now, if anything (doc 234
 * §5.3). Pure: it reads the standing bid and every proxy and answers with at
 * most one bid, never a ladder of them, so a 10 000 to 1 gap between two
 * maxima costs one ledger row and not a hundred.
 *
 * Each bidder's ceiling is the larger of their proxy maximum and, for the one
 * who holds the standing bid, that bid. The bidder with the highest ceiling
 * leads; of equal ceilings the earlier wins, a proxy counting as placed half a
 * step after the bid whose `seq` it was placed after. They lead at the least
 * that still beats the next-highest ceiling by one increment, capped at their
 * own ceiling, so with maxima of 100 and 80 the leader stands at 80 plus the
 * increment, and with equal maxima the earlier one stands at that maximum.
 *
 * The answer is null when nothing needs placing: nobody has a proxy that can
 * beat the standing bid, or the leader already stands at or above the price
 * their competition calls for.
 */
export function resolveProxy(input: {
  standing: StandingBid | null;
  startPriceMinor: number;
  proxies: readonly ProxyOffer[];
  rules: BidRules;
}): ProxyBidToPlace | null {
  const { standing, startPriceMinor, proxies, rules } = input;

  interface Ceiling {
    bidderId: string;
    maxMinor: number;
    order: number;
  }
  const ceilings = new Map<string, Ceiling>();
  for (const proxy of proxies) {
    ceilings.set(proxy.bidderId, { bidderId: proxy.bidderId, maxMinor: proxy.maxMinor, order: proxy.placedAfterSeq + 0.5 });
  }
  if (standing) {
    const own = ceilings.get(standing.bidderId);
    // A proxy at least as high as the standing bid keeps its own, earlier, place.
    if (!own || own.maxMinor < standing.amountMinor) {
      ceilings.set(standing.bidderId, { bidderId: standing.bidderId, maxMinor: standing.amountMinor, order: standing.seq });
    }
  }
  if (ceilings.size === 0) return null;

  const ranked = [...ceilings.values()].sort((a, b) => b.maxMinor - a.maxMinor || a.order - b.order);
  const winner = ranked[0]!;
  const runnerUp = ranked[1] ?? null;
  const price = standing === null ? null : standing.amountMinor;

  if (runnerUp === null) {
    // Nobody to beat: a lone proxy opens the bidding at the opening price.
    return price === null && winner.maxMinor >= startPriceMinor ? { bidderId: winner.bidderId, amountMinor: startPriceMinor } : null;
  }
  const target = Math.min(winner.maxMinor, runnerUp.maxMinor + computeIncrement(runnerUp.maxMinor, rules));
  if (standing && winner.bidderId === standing.bidderId) {
    // The leader keeps the lead; their price only rises.
    return target > standing.amountMinor ? { bidderId: winner.bidderId, amountMinor: target } : null;
  }
  // Someone with a higher or earlier ceiling takes the lead, never below the price now standing.
  return { bidderId: winner.bidderId, amountMinor: Math.max(target, price ?? startPriceMinor) };
}

export interface LotOutcome {
  topBidderId: string | null;
  topBidMinor: number | null;
  reserveMet: boolean;
}

/**
 * How a lot ended (doc 234 §5.5). The reserve is met by a highest bid at or
 * above it, or by any bid when there is no reserve; a lot with no bids never
 * meets it. The highest bidder is kept either way, so staff can decide whether
 * to make a below-reserve bidder an offer, which is never automatic.
 */
export function lotOutcome(input: {
  currentBidMinor: number | null;
  leaderBidderId: string | null;
  reservePriceMinor: number | null;
}): LotOutcome {
  const { currentBidMinor, leaderBidderId, reservePriceMinor } = input;
  if (currentBidMinor === null || leaderBidderId === null) return { topBidderId: null, topBidMinor: null, reserveMet: false };
  return {
    topBidderId: leaderBidderId,
    topBidMinor: currentBidMinor,
    reserveMet: reservePriceMinor === null || currentBidMinor >= reservePriceMinor,
  };
}
