/**
 * What a won lot owes, and what may happen to the debt next (doc 234 §9,
 * WO-234.6). Pure on purpose: no database, no clock of its own, so the money
 * arithmetic and the allowed moves can be tested without either, and the
 * service, the sweep and the screens cannot disagree about them.
 */
import type { AuctionInvoiceLine } from '../../../core/extension-points/auction-order-sink.registry';

/** The `sourceType` an auction settlement asks the order sink to file its order under. */
export const SETTLEMENT_ORDER_SOURCE = 'AUCTION_SETTLEMENT';

export const SETTLEMENT_STATUSES = ['INVOICING', 'INVOICE_FAILED', 'AWAITING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED'] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

/** Settlements whose debt is still live: a winner who may yet pay, or staff who may yet fix the invoice. */
export const LIVE_SETTLEMENT_STATUSES: readonly SettlementStatus[] = ['INVOICING', 'INVOICE_FAILED', 'AWAITING_PAYMENT'];

/**
 * The buyer's premium on a winning bid: `bps` basis points of it, rounded half
 * up to a whole minor unit. Done in BigInt because 10^15 × 5 000 overflows the
 * 2^53 a double holds exactly (the largest price is `MAX_PRICE_MINOR`).
 */
export function premiumFor(hammerMinor: number, bps: number): number {
  if (!Number.isSafeInteger(hammerMinor) || hammerMinor < 0) throw new RangeError('A winning bid is a whole, non-negative number of minor units.');
  if (!Number.isInteger(bps) || bps < 0) throw new RangeError('A premium is a whole, non-negative number of basis points.');
  return Number((BigInt(hammerMinor) * BigInt(bps) + 5_000n) / 10_000n);
}

export type SettlementAmounts = { hammerMinor: number; premiumMinor: number; totalMinor: number };

export function settlementAmounts(hammerMinor: number, premiumBps: number): SettlementAmounts {
  const premiumMinor = premiumFor(hammerMinor, premiumBps);
  return { hammerMinor, premiumMinor, totalMinor: hammerMinor + premiumMinor };
}

/** When a win lapses: the window after the moment the debt was created (never the close, so an outage after the close does not eat the window). */
export function paymentDueAt(from: Date, windowMs: number): Date {
  return new Date(from.getTime() + windowMs);
}

/** What has been received covers what is owed. Exact, in minor units: there is no rounding to forgive. */
export function isCovered(paidMinor: number, totalMinor: number): boolean {
  return totalMinor > 0 && paidMinor >= totalMinor;
}

/** The lines of the order a winner is invoiced: the lot, and the premium as its own line when there is one. */
export function invoiceLines(input: { auctionNumber: string; lotNo: number; lotTitle: string; amounts: SettlementAmounts; premiumBps: number }): AuctionInvoiceLine[] {
  const lines: AuctionInvoiceLine[] = [
    { name: `${input.lotTitle} (lot ${input.lotNo}, ${input.auctionNumber})`, kind: 'GOODS', amountMinor: input.amounts.hammerMinor },
  ];
  if (input.amounts.premiumMinor > 0) {
    // 1 000 bps prints as "10%", 250 as "2.5%": trailing zeros trimmed, never a rounded rate.
    const percent = `${(input.premiumBps / 100).toString()}%`;
    lines.push({ name: `Buyer's premium (${percent}, ${input.auctionNumber})`, kind: 'SERVICE', amountMinor: input.amounts.premiumMinor });
  }
  return lines;
}

export type SettlementActions = {
  /** Try to make the invoice again. */
  replay: boolean;
  /** End the debt without a strike (the buyer and the shop agreed, or it was a mistake). */
  cancel: boolean;
  /** Offer the lot to the next highest bidder, at that bidder's own bid. */
  offerNext: boolean;
};

/**
 * What staff may do to a settlement in a given state. An offer needs the
 * previous debt to be over without payment (`EXPIRED` or `CANCELLED`) and to be
 * the latest one for its lot; a paid debt cannot be ended here (it is refunded
 * from the order), and a debt still being invoiced is left to finish.
 */
export function settlementActions(status: SettlementStatus, opts: { isLatestForLot: boolean; stalledMs?: number }): SettlementActions {
  return {
    replay: status === 'INVOICE_FAILED' || (status === 'INVOICING' && (opts.stalledMs ?? 0) >= STALLED_INVOICING_MS),
    cancel: status === 'AWAITING_PAYMENT' || status === 'INVOICE_FAILED',
    offerNext: opts.isLatestForLot && (status === 'EXPIRED' || status === 'CANCELLED'),
  };
}

/** A settlement still `INVOICING` after this long was dropped mid-way (a crash, an exhausted retry) and is picked up again. */
export const STALLED_INVOICING_MS = 120_000;

export type NextBidderCandidate = { bidderId: string; status: string; highestBidMinor: number };

/**
 * The next highest bidder who may be offered the lot: approved, not already
 * given a turn on it, with the highest accepted bid among those left. Ties go
 * to the earlier id so two staff asking at once see the same person.
 */
export function pickNextBidder(candidates: NextBidderCandidate[], alreadyOffered: readonly string[]): NextBidderCandidate | null {
  const skipped = new Set(alreadyOffered);
  const eligible = candidates.filter((c) => c.status === 'APPROVED' && !skipped.has(c.bidderId) && c.highestBidMinor > 0);
  eligible.sort((a, b) => b.highestBidMinor - a.highestBidMinor || a.bidderId.localeCompare(b.bidderId));
  return eligible[0] ?? null;
}
