import type { LotOutcome, ViewerLotState } from './auction-live';

/**
 * What the lot page tells a winner about paying (launchpad-apps/234-auction-app.md
 * §9, §11, WO-234.6): which card their debt gets, whether the page should keep
 * asking, and how fast. All arithmetic on plain values, tested without a render.
 *
 * The shape mirrors `WinnerSettlementView` in the API: the viewer's own debt on
 * this lot and nobody else's.
 */

export type WinnerSettlementStatus = 'INVOICING' | 'INVOICE_FAILED' | 'AWAITING_PAYMENT' | 'PAID' | 'EXPIRED' | 'CANCELLED';

export interface WinnerSettlement {
  status: WinnerSettlementStatus;
  /** 1 for the winner of the lot; 2 or more for a bidder it was offered to afterwards. */
  attempt: number;
  currency: string;
  hammerMinor: number;
  premiumMinor: number;
  totalMinor: number;
  paidMinor: number;
  dueAt: string;
  orderNumber: string | null;
}

/** What the winner's card says. One kind for each thing a person could be told. */
export type SettlementCard =
  | { kind: 'preparing' }
  | { kind: 'delayed' }
  | {
      kind: 'pay';
      /** The lot came to this person after the first buyer did not pay. */
      offered: boolean;
      hammerMinor: number;
      premiumMinor: number;
      totalMinor: number;
      /** What is still owed, shown only once part of it has been paid. */
      leftMinor: number | null;
      dueAt: string;
      orderNumber: string | null;
    }
  | { kind: 'paid'; totalMinor: number; orderNumber: string | null }
  | { kind: 'lapsed'; dueAt: string; paidMinor: number }
  | { kind: 'cancelled' };

/**
 * The card for the viewer's debt, or `null` when there is nothing to say.
 * `expecting` is true when the lot's result says this person won it: then an
 * absent debt is "being prepared" (the close was announced a moment ago and the
 * invoice is on its way), not "nothing to show".
 */
export function settlementCard(settlement: WinnerSettlement | null | undefined, expecting: boolean): SettlementCard | null {
  if (!settlement) return expecting ? { kind: 'preparing' } : null;
  switch (settlement.status) {
    case 'INVOICING':
      return { kind: 'preparing' };
    case 'INVOICE_FAILED':
      return { kind: 'delayed' };
    case 'AWAITING_PAYMENT':
      return {
        kind: 'pay',
        offered: settlement.attempt > 1,
        hammerMinor: settlement.hammerMinor,
        premiumMinor: settlement.premiumMinor,
        totalMinor: settlement.totalMinor,
        leftMinor: settlement.paidMinor > 0 ? Math.max(settlement.totalMinor - settlement.paidMinor, 0) : null,
        dueAt: settlement.dueAt,
        orderNumber: settlement.orderNumber,
      };
    case 'PAID':
      return { kind: 'paid', totalMinor: settlement.totalMinor, orderNumber: settlement.orderNumber };
    case 'EXPIRED':
      return { kind: 'lapsed', dueAt: settlement.dueAt, paidMinor: settlement.paidMinor };
    case 'CANCELLED':
      return { kind: 'cancelled' };
  }
}

/** Whether the closed lot's result names this viewer as its buyer. The alias is the only thing a public result carries, so it is what is compared. */
export function expectsSettlement(outcome: LotOutcome | undefined, phase: string, viewerAlias: string | null): boolean {
  return phase === 'CLOSED' && outcome?.kind === 'SOLD' && viewerAlias !== null && outcome.topBidderAlias === viewerAlias;
}

/**
 * Whether the page should keep reading the viewer: while the person is the
 * buyer and the invoice has not appeared yet. Every other state stays as it is
 * until they do something or come back to the page.
 */
export function needsSettlementPoll(viewer: ViewerLotState | null, expecting: boolean): boolean {
  if (!expecting) return false;
  const status = viewer?.settlement?.status;
  return status === undefined || status === 'INVOICING';
}

/**
 * How long a page waiting for its invoice leaves before the next read, in
 * milliseconds, after `reads` reads so far. The invoice is made within a few
 * seconds of the close, so the first minute (12 reads) asks every 5 000; if it
 * has still not come, something is slow, and the page drops to the 20 000 the
 * registration wait uses rather than keep asking at the fast rate for as long as
 * the tab is open. The caller spreads it ±20 %.
 */
export function settlementPollMs(reads: number): number {
  return reads < SETTLEMENT_FAST_READS ? SETTLEMENT_FAST_POLL_MS : SETTLEMENT_SLOW_POLL_MS;
}

export const SETTLEMENT_FAST_POLL_MS = 5_000;
export const SETTLEMENT_FAST_READS = 12;
export const SETTLEMENT_SLOW_POLL_MS = 20_000;

/** The premium as a percentage of the winning bid, for a sentence: 1 000 basis points is 10. */
export const premiumPercent = (bps: number): number => bps / 100;
