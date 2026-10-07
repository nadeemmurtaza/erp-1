import { ApiError, formatMoney } from '@newax/shared';

/**
 * What the admin auction page does with the settlements API (launchpad-apps/
 * 234-auction-app.md §9, §11, WO-234.6): which acts a win's state allows, the
 * words for each state, and the sentence that follows an act or a refusal.
 * Arithmetic on plain values, so it is tested without a render. The shapes
 * mirror `AuctionSettlementService` in the API.
 *
 * Admin pages write their words as literals (`ITG-9` names that as a gap), so
 * the sentences live here rather than in the messages files; the customer
 * surface for the same feature is `auction-settlement.ts` and the messages.
 */

export type SettlementStatus = 'INVOICING' | 'INVOICE_FAILED' | 'AWAITING_PAYMENT' | 'PAID' | 'EXPIRED' | 'CANCELLED';
export type SettlementFilter = 'open' | 'ended' | 'all';

/** The longest a cancellation reason may be: the API's own limit (`MAX_REASON_LENGTH`), counted on the form. */
export const MAX_CANCEL_REASON_LENGTH = 500;

export interface SettlementRow {
  id: string;
  attempt: number;
  status: SettlementStatus;
  lot: { id: string; lotNo: number; title: string };
  bidder: { alias: string };
  currency: string;
  hammerMinor: number;
  premiumBps: number;
  premiumMinor: number;
  totalMinor: number;
  paidMinor: number;
  dueAt: string;
  orderId: string | null;
  orderNumber: string | null;
  failureReason: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  createdAt: string;
  /** A strike was recorded when the win lapsed. */
  struck: boolean;
  actions: { replay: boolean; cancel: boolean; offerNext: boolean };
  /** Who "offer to the next bidder" would go to, and at what; null when it is not on offer or nobody is left. */
  next: { alias: string; bidMinor: number } | null;
}

export interface SettlementSummary {
  awaiting: number;
  needsAttention: number;
  paid: number;
  ended: number;
}

export type SettlementAct = 'replay' | 'cancel' | 'offerNext';

/** The acts a win allows, in the order the buttons appear. The server decides again from the status the screen was looking at. */
export function settlementActs(row: Pick<SettlementRow, 'actions'>): SettlementAct[] {
  const acts: SettlementAct[] = [];
  if (row.actions.replay) acts.push('replay');
  if (row.actions.offerNext) acts.push('offerNext');
  if (row.actions.cancel) acts.push('cancel');
  return acts;
}

/** The view a staff member lands on: what is still owed or needs fixing, else the history. */
export function defaultSettlementFilter(summary: SettlementSummary | null): SettlementFilter {
  return summary && summary.awaiting + summary.needsAttention === 0 && summary.paid + summary.ended > 0 ? 'ended' : 'open';
}

export function settlementFilterOptions(summary: SettlementSummary | null): Array<{ value: SettlementFilter; label: string }> {
  const count = (n: number | undefined) => (n === undefined ? '' : ` ${n}`);
  return [
    { value: 'open', label: `Open${count(summary ? summary.awaiting + summary.needsAttention : undefined)}` },
    { value: 'ended', label: `Paid or ended${count(summary ? summary.paid + summary.ended : undefined)}` },
    { value: 'all', label: `All${count(summary ? summary.awaiting + summary.needsAttention + summary.paid + summary.ended : undefined)}` },
  ];
}

/** The strip cell's one figure: what needs a person first, else what is owed, else how many were paid. */
export function settlementStripValue(summary: SettlementSummary | null): string {
  if (!summary) return '—';
  if (summary.needsAttention > 0) return `${summary.needsAttention} to fix`;
  if (summary.awaiting > 0) return `${summary.awaiting} unpaid`;
  if (summary.paid > 0) return `${summary.paid} paid`;
  return 'None yet';
}

/** The word on a status badge. The shared badge would say "Awaiting payment" or "Expired"; staff talk about who owes what. */
export function settlementStatusWord(status: SettlementStatus): string {
  switch (status) {
    case 'INVOICING':
      return 'Invoicing';
    case 'INVOICE_FAILED':
      return 'Invoice failed';
    case 'AWAITING_PAYMENT':
      return 'Unpaid';
    case 'PAID':
      return 'Paid';
    case 'EXPIRED':
      return 'Lapsed';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

/** The tone a status wears. `StatusBadge` has no key for most of these, so the panel picks the tone itself. */
export function settlementTone(status: SettlementStatus): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  switch (status) {
    case 'PAID':
      return 'success';
    case 'AWAITING_PAYMENT':
      return 'warning';
    case 'INVOICE_FAILED':
    case 'EXPIRED':
      return 'danger';
    case 'CANCELLED':
      return 'neutral';
    case 'INVOICING':
      return 'info';
  }
}

/** The line under a row's amount: the bid and the premium apart, so staff can see what was added. */
export function amountBreakdown(row: Pick<SettlementRow, 'hammerMinor' | 'premiumMinor'>): string {
  return row.premiumMinor > 0 ? `${formatMoney(row.hammerMinor)} bid + ${formatMoney(row.premiumMinor)} premium` : `${formatMoney(row.hammerMinor)} bid`;
}

/** What is still owed on an unpaid win, shown only once part has been paid. */
export function leftToPay(row: Pick<SettlementRow, 'status' | 'totalMinor' | 'paidMinor'>): number | null {
  return row.status === 'AWAITING_PAYMENT' && row.paidMinor > 0 ? Math.max(row.totalMinor - row.paidMinor, 0) : null;
}

/**
 * Money received on a win that had already ended: the one state staff must act
 * on outside this panel (refund it, or honour the sale), so the row says it.
 */
export function receivedAfterEnd(row: Pick<SettlementRow, 'status' | 'paidMinor'>): boolean {
  return (row.status === 'EXPIRED' || row.status === 'CANCELLED') && row.paidMinor > 0;
}

/** The act's button: a verb and its object, never "Yes" or "OK" (`DNG-2`). */
export function settlementActLabel(act: SettlementAct, row: Pick<SettlementRow, 'lot' | 'next'>): string {
  switch (act) {
    case 'replay':
      return 'Try invoice again';
    case 'cancel':
      return `Cancel win of lot ${row.lot.lotNo}`;
    case 'offerNext':
      // Begins with the button's own words ("Offer to next") so a person who speaks the visible label reaches it (WCAG 2.5.3).
      return row.next ? `Offer to next bidder: lot ${row.lot.lotNo} to ${row.next.alias}` : `Offer to next bidder: lot ${row.lot.lotNo}`;
  }
}

/** What an offer to the next bidder will do, for the confirmation: the person, the price, and what happens to the first buyer's claim. */
export function offerNextConsequence(row: Pick<SettlementRow, 'lot' | 'next' | 'premiumBps' | 'status'>): string {
  if (!row.next) return 'Nobody else who may bid has bid on this lot, so there is no one to offer it to.';
  const premium = row.premiumBps > 0 ? ` plus the ${row.premiumBps / 100}% buyer’s premium` : '';
  return `${row.next.alias} gets an invoice for ${formatMoney(row.next.bidMinor)}${premium}, with a new payment window. The first buyer’s win stays ${
    row.status === 'EXPIRED' ? 'lapsed' : 'cancelled'
  }. Each bidder can be offered a lot once.`;
}

/** What follows a successful act, saying what happened to which win (`SUC-1`). */
export function settlementSuccess(act: SettlementAct, after: Pick<SettlementRow, 'lot' | 'bidder' | 'status' | 'orderNumber' | 'failureReason'>): string {
  switch (act) {
    case 'replay':
      return after.status === 'AWAITING_PAYMENT'
        ? `The invoice for lot ${after.lot.lotNo} was made${after.orderNumber ? ` as order ${after.orderNumber}` : ''}. ${after.bidder.alias} has been told.`
        : `The invoice for lot ${after.lot.lotNo} could not be made yet: ${after.failureReason ?? 'see the row'}. Nothing was charged.`;
    case 'cancel':
      return `The win of lot ${after.lot.lotNo} by ${after.bidder.alias} was cancelled. No strike was recorded.`;
    case 'offerNext':
      return after.status === 'AWAITING_PAYMENT'
        ? `Lot ${after.lot.lotNo} was offered to ${after.bidder.alias}${after.orderNumber ? ` as order ${after.orderNumber}` : ''}.`
        : `Lot ${after.lot.lotNo} was offered to ${after.bidder.alias}, but the invoice could not be made yet: ${after.failureReason ?? 'see the row'}.`;
  }
}

/**
 * What a failed read says: never the server's own words, which can be
 * "Internal server error". Nothing was being changed, so it does not say so; it
 * says what could not be shown and what to do.
 */
export function describeSettlementLoadFailure(error: unknown): string {
  if (error instanceof ApiError && error.status === 403) return 'You do not have permission to see what winners owe. Ask an administrator.';
  if (error instanceof ApiError && error.status === 404) return 'We could not find this auction’s wins. Go back to the auction list and try again.';
  if (!(error instanceof ApiError)) return 'We could not reach the server to load what winners owe. Check your connection and try again.';
  return 'We could not load what winners owe. Try again.';
}

/**
 * What went wrong with an act, as what happened, why and what to do next. The
 * API's English is used only where it already says all three; a status with no
 * body (the request never arrived) is told as a connection problem.
 */
export function describeSettlementFailure(error: unknown, lotNo: number): string {
  if (!(error instanceof ApiError)) return 'We could not reach the server, so nothing was changed. Check your connection and try again.';
  const body = error.body as { code?: string; message?: unknown; details?: { status?: unknown } } | null | undefined;
  switch (body?.code) {
    case 'SETTLEMENT_CHANGED': {
      const now = typeof body.details?.status === 'string' ? ` and is now ${settlementStatusWord(body.details.status as SettlementStatus).toLowerCase()}` : '';
      return `Lot ${lotNo} has changed since you opened it${now}. Nothing was changed. Look at where it stands now and decide again if you still need to.`;
    }
    case 'CANNOT_DECIDE_OWN':
      return 'You cannot act on a win that is yours. Ask another holder of "See what auction winners owe" to do it. Nothing was changed.';
    case 'NO_NEXT_BIDDER':
      return `Nobody else who may bid has bid on lot ${lotNo}, so there is no one to offer it to. Nothing was changed.`;
    case 'REASON_REQUIRED':
      return 'Write why the win is being cancelled. Nothing was changed.';
    default:
      break;
  }
  if (error.status === 400 && typeof body?.message === 'string') return `${body.message} Nothing was changed.`;
  if (error.status === 403) return 'You do not have permission to settle auctions. Nothing was changed. Ask an administrator.';
  if (error.status === 404) return `Lot ${lotNo}’s win is no longer here. Nothing was changed. Go back to the list.`;
  return 'We could not save that. Nothing was changed. Try again.';
}
