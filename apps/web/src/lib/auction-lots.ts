/**
 * What an auction's lots say about when they end and how they ended
 * (launchpad-apps/234-auction-app.md §5.4, §5.5). Pure, so the admin page
 * stays markup and the arithmetic is tested without a render.
 */

export interface LotTiming {
  status: string;
  /** The lot's own end once moved by anti-snipe or by recovery after an outage; null while it ends with the auction. */
  endsAt: string | null;
  /** Milliseconds of anti-snipe extension this lot has used. */
  extendedMs: number;
}

export interface LotOutcomeView {
  topBidderAlias: string | null;
  topBidMinor: number | null;
  /** Sent only to a holder of `auction.manage`. */
  reserveMet?: boolean;
  bidCount: number;
}

/** When bidding on a lot ends: its own end if it has one, else the auction's. */
export function lotEndsAt(lot: LotTiming, auctionEndsAt: string): string {
  return lot.endsAt ?? auctionEndsAt;
}

/**
 * When the auction as a whole will close: the latest end among the lots still
 * open, since a lot extended past the auction's end keeps it open. With no
 * lot open it is the auction's own end.
 */
export function auctionClosesAt(lots: readonly LotTiming[], auctionEndsAt: string): string {
  let latest = auctionEndsAt;
  let seenOpen = false;
  for (const lot of lots) {
    if (lot.status !== 'OPEN') continue;
    const end = lotEndsAt(lot, auctionEndsAt);
    if (!seenOpen || new Date(end).getTime() > new Date(latest).getTime()) latest = end;
    seenOpen = true;
  }
  return latest;
}

/** "extended 2 min", or null when anti-snipe has not moved this lot. Whole minutes, rounded up, so 30 s still reads as a minute. */
export function describeExtension(extendedMs: number): string | null {
  if (extendedMs <= 0) return null;
  const minutes = Math.ceil(extendedMs / 60_000);
  return `extended ${minutes} min`;
}

/**
 * One line for how a lot ended: the winner and price, "No bids", or the
 * highest bid with the reserve not met. A viewer who may not see the reserve is
 * told only the bidder and price, never whether it was met.
 */
export function describeOutcome(result: LotOutcomeView, formatMoney: (minor: number) => string): { text: string; reserveNotMet: boolean } {
  if (result.topBidderAlias === null || result.topBidMinor === null) return { text: 'No bids', reserveNotMet: false };
  return {
    text: `${result.topBidderAlias} · ${formatMoney(result.topBidMinor)}`,
    reserveNotMet: result.reserveMet === false,
  };
}
