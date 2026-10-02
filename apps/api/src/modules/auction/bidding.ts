import { toMinor } from '@newax/shared';
import { canonicalize } from '../../core/common/hash-chain';

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
};

/**
 * What an auction falls back to when its frozen rules are missing or malformed
 * (doc 234 §12, "rule missing → 5%"). 5% takes about 15 raises to double a
 * price, which keeps a contest moving without penny-bids; one whole currency
 * unit (`toMinor(1)`, so it follows the brand's currency) is the smallest step
 * a person would call a raise.
 */
export const DEFAULT_BID_RULES: BidRules = { incrementBps: 500, minStepMinor: toMinor(1) };

const isCount = (value: unknown, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max;

/** Reads the `Auction.bidRules` JSON, taking each field it can trust and the default for the rest. */
export function parseBidRules(raw: unknown): BidRules {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    incrementBps: isCount(source.incrementBps, 10_000) ? source.incrementBps : DEFAULT_BID_RULES.incrementBps,
    minStepMinor: isCount(source.minStepMinor, MAX_PRICE_MINOR) ? source.minStepMinor : DEFAULT_BID_RULES.minStepMinor,
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
